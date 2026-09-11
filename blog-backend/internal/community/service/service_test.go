package service

import (
	"context"
	"errors"
	"testing"
	"time"

	communitydomain "github.com/rushairer/blog-backend/internal/community/domain"
	communityrepository "github.com/rushairer/blog-backend/internal/community/repository"
	rootdomain "github.com/rushairer/blog-backend/internal/domain"
)

type fakeCommunityRepo struct {
	created       *communitydomain.Comment
	createErr     error
	reportErr     error
	moderateID    int64
	moderateState string
	likes         map[string]bool
}

func (r *fakeCommunityRepo) CreateComment(_ context.Context, comment *communitydomain.Comment) error {
	r.created = comment
	comment.ID = 11
	comment.CreatedAt = time.Now()
	return r.createErr
}
func (*fakeCommunityRepo) GetVisibleComments(context.Context, int64) ([]*communitydomain.Comment, error) {
	return nil, nil
}
func (*fakeCommunityRepo) GetAllComments(context.Context, int64) ([]*communitydomain.Comment, error) {
	return nil, nil
}
func (*fakeCommunityRepo) ListCommentsForAdmin(context.Context, string, bool, int, int) ([]*communitydomain.Comment, int, error) {
	return nil, 0, nil
}
func (r *fakeCommunityRepo) ModerateComment(_ context.Context, id int64, status string) error {
	r.moderateID, r.moderateState = id, status
	return nil
}
func (*fakeCommunityRepo) DeleteComment(context.Context, int64) error { return nil }
func (r *fakeCommunityRepo) ReportComment(context.Context, int64, string, string) error {
	return r.reportErr
}
func (r *fakeCommunityRepo) SetLike(_ context.Context, _ int64, actor string, liked bool) (*communitydomain.State, error) {
	if r.likes == nil {
		r.likes = map[string]bool{}
	}
	r.likes[actor] = liked
	return &communitydomain.State{Liked: liked, LikesCount: 1}, nil
}
func (r *fakeCommunityRepo) CommunityState(_ context.Context, _ int64, actor, _ string) (*communitydomain.State, error) {
	return &communitydomain.State{Liked: r.likes[actor]}, nil
}
func (*fakeCommunityRepo) ListNotifications(context.Context, int64, int, int) ([]*communitydomain.Notification, int, error) {
	return nil, 0, nil
}
func (*fakeCommunityRepo) ReadNotification(context.Context, int64, int64) error      { return nil }
func (*fakeCommunityRepo) ReadAllNotifications(context.Context, int64) error         { return nil }
func (*fakeCommunityRepo) DeleteNotification(context.Context, int64, int64) error    { return nil }
func (*fakeCommunityRepo) DeleteNotifications(context.Context, int64, []int64) error { return nil }
func (*fakeCommunityRepo) ClearNotifications(context.Context, int64, bool) (int64, error) {
	return 0, nil
}

type fakePostLookup struct {
	post        *rootdomain.Post
	postsByID   map[int64]*rootdomain.Post
	postsBySlug map[string]*rootdomain.Post
}

func (f fakePostLookup) GetByID(_ context.Context, id int64) (*rootdomain.Post, error) {
	if f.postsByID != nil {
		return f.postsByID[id], nil
	}
	return f.post, nil
}
func (f fakePostLookup) GetBySlug(_ context.Context, slug string) (*rootdomain.Post, error) {
	if f.postsBySlug != nil {
		return f.postsBySlug[slug], nil
	}
	return f.post, nil
}

func newCommunityServiceForTest(repo *fakeCommunityRepo) *CommunityService {
	return NewCommunityService(repo, fakePostLookup{post: &rootdomain.Post{ID: 1, Slug: "post", Status: rootdomain.PostStatusPublished}})
}

func TestCommunityCreateCommentUsesAuthenticatedIdentityAndIsVisible(t *testing.T) {
	repo := &fakeCommunityRepo{}
	svc := newCommunityServiceForTest(repo)
	actor := Actor{Key: "principal:42", PrincipalID: 42, DisplayName: "Ada", Authenticated: true}
	comment, err := svc.CreateComment(context.Background(), 1, nil, actor, "spoofed", "Hello")
	if err != nil {
		t.Fatal(err)
	}
	if comment.Author != "Ada" || comment.AuthorPrincipalID == nil || *comment.AuthorPrincipalID != actor.PrincipalID {
		t.Fatalf("authenticated identity not applied: %#v", comment)
	}
	if comment.Status != "visible" || !comment.IsVisible {
		t.Fatalf("authenticated comment should be visible: %#v", comment)
	}
}

func TestCommunityCreateAnonymousCommentRequiresNameAndIsPending(t *testing.T) {
	repo := &fakeCommunityRepo{}
	svc := newCommunityServiceForTest(repo)
	if _, err := svc.CreateComment(context.Background(), 1, nil, Actor{Key: "anon:a"}, "", "Hello"); !errors.Is(err, ErrCommentAuthorEmpty) {
		t.Fatalf("expected ErrCommentAuthorEmpty, got %v", err)
	}
	comment, err := svc.CreateComment(context.Background(), 1, nil, Actor{Key: "anon:a"}, "Guest", "Hello")
	if err != nil {
		t.Fatal(err)
	}
	if comment.Status != "pending" || comment.IsVisible || comment.AuthorType != "anonymous" {
		t.Fatalf("anonymous comment should await moderation: %#v", comment)
	}
}

func TestCommunityRejectsInvalidModerationStateAndDuplicateReport(t *testing.T) {
	repo := &fakeCommunityRepo{reportErr: communityrepository.ErrDuplicateInteraction}
	svc := newCommunityServiceForTest(repo)
	if err := svc.ModerateComment(context.Background(), 3, "deleted"); !errors.Is(err, ErrInvalidCommentStatus) {
		t.Fatalf("expected ErrInvalidCommentStatus, got %v", err)
	}
	err := svc.ReportComment(context.Background(), 3, Actor{Key: "anon:a"}, "spam")
	if !errors.Is(err, communityrepository.ErrDuplicateInteraction) {
		t.Fatalf("expected duplicate report error, got %v", err)
	}
}

func TestCommunityResolvesNumericSlugWhenIDDoesNotExist(t *testing.T) {
	post := &rootdomain.Post{ID: 8, Slug: "112", Status: rootdomain.PostStatusPublished}
	svc := NewCommunityService(&fakeCommunityRepo{}, fakePostLookup{
		postsByID: map[int64]*rootdomain.Post{}, postsBySlug: map[string]*rootdomain.Post{"112": post},
	})
	resolved, err := svc.ResolvePublishedPost(context.Background(), "112")
	if err != nil || resolved.ID != post.ID {
		t.Fatalf("ResolvePublishedPost = %#v, %v; want numeric slug post", resolved, err)
	}
}
