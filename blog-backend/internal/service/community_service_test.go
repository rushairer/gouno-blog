package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
)

type fakeCommunityRepo struct {
	created       *domain.Comment
	createErr     error
	reportErr     error
	moderateID    int64
	moderateState string
	likes         map[string]bool
	bookmarks     map[string]bool
	notifications map[string][]*domain.Notification
}

func (r *fakeCommunityRepo) CreateComment(_ context.Context, comment *domain.Comment) error {
	r.created = comment
	comment.ID = 11
	comment.CreatedAt = time.Now()
	return r.createErr
}
func (*fakeCommunityRepo) GetVisibleComments(context.Context, int64) ([]*domain.Comment, error) {
	return nil, nil
}
func (*fakeCommunityRepo) ListCommentsForAdmin(context.Context, string, bool, int, int) ([]*domain.Comment, int, error) {
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
func (r *fakeCommunityRepo) SetLike(_ context.Context, postID int64, actor string, liked bool) (*domain.CommunityState, error) {
	if r.likes == nil {
		r.likes = map[string]bool{}
	}
	r.likes[actor] = liked
	return &domain.CommunityState{Liked: liked, LikesCount: 1}, nil
}
func (r *fakeCommunityRepo) CommunityState(_ context.Context, _ int64, actor, subject string) (*domain.CommunityState, error) {
	return &domain.CommunityState{Liked: r.likes[actor], Bookmarked: r.bookmarks[subject]}, nil
}
func (r *fakeCommunityRepo) SetBookmark(_ context.Context, subject string, postID int64, bookmarked bool) error {
	if r.bookmarks == nil {
		r.bookmarks = map[string]bool{}
	}
	r.bookmarks[subject] = bookmarked
	return nil
}
func (*fakeCommunityRepo) ListBookmarks(context.Context, string) ([]*domain.Bookmark, error) {
	return nil, nil
}
func (r *fakeCommunityRepo) ListNotifications(_ context.Context, subject string, _, _ int) ([]*domain.Notification, int, error) {
	return r.notifications[subject], len(r.notifications[subject]), nil
}
func (*fakeCommunityRepo) ReadNotification(context.Context, string, int64) error { return nil }
func (*fakeCommunityRepo) ReadAllNotifications(context.Context, string) error    { return nil }
func (*fakeCommunityRepo) DeleteNotification(context.Context, string, int64) error { return nil }
func (*fakeCommunityRepo) DeleteNotifications(context.Context, string, []int64) error { return nil }
func (*fakeCommunityRepo) ClearNotifications(context.Context, string, bool) (int64, error) { return 0, nil }

type fakePostLookup struct {
	post        *domain.Post
	postsByID   map[int64]*domain.Post
	postsBySlug map[string]*domain.Post
}

func (f fakePostLookup) GetByID(_ context.Context, id int64) (*domain.Post, error) {
	if f.postsByID != nil {
		return f.postsByID[id], nil
	}
	return f.post, nil
}
func (f fakePostLookup) GetBySlug(_ context.Context, slug string) (*domain.Post, error) {
	if f.postsBySlug != nil {
		return f.postsBySlug[slug], nil
	}
	return f.post, nil
}

func newCommunityServiceForTest(repo *fakeCommunityRepo) *CommunityService {
	return NewCommunityService(repo, fakePostLookup{post: &domain.Post{ID: 1, Slug: "post", Status: domain.PostStatusPublished}})
}

func TestCommunityCreateCommentUsesAuthenticatedIdentityAndIsVisible(t *testing.T) {
	repo := &fakeCommunityRepo{}
	svc := newCommunityServiceForTest(repo)
	comment, err := svc.CreateComment(context.Background(), 1, nil, Actor{
		Key: "user:42", Subject: "42", DisplayName: "Ada", Authenticated: true,
	}, "spoofed", "Hello")
	if err != nil {
		t.Fatal(err)
	}
	if comment.Author != "Ada" || comment.AuthorSubject == nil || *comment.AuthorSubject != "42" {
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
	repo := &fakeCommunityRepo{reportErr: repository.ErrDuplicateInteraction}
	svc := newCommunityServiceForTest(repo)
	if err := svc.ModerateComment(context.Background(), 3, "deleted"); !errors.Is(err, ErrInvalidCommentStatus) {
		t.Fatalf("expected ErrInvalidCommentStatus, got %v", err)
	}
	err := svc.ReportComment(context.Background(), 3, Actor{Key: "anon:a"}, "spam")
	if !errors.Is(err, repository.ErrDuplicateInteraction) {
		t.Fatalf("expected duplicate report error, got %v", err)
	}
}

func TestCommunityBookmarkRequiresAuthenticatedSubject(t *testing.T) {
	svc := newCommunityServiceForTest(&fakeCommunityRepo{})
	if err := svc.SetBookmark(context.Background(), "", 1, true); err == nil {
		t.Fatal("expected empty subject to fail")
	}
}

func TestCommunityResolvesNumericSlugWhenIDDoesNotExist(t *testing.T) {
	post := &domain.Post{ID: 8, Slug: "112", Status: domain.PostStatusPublished}
	svc := NewCommunityService(&fakeCommunityRepo{}, fakePostLookup{
		postsByID: map[int64]*domain.Post{}, postsBySlug: map[string]*domain.Post{"112": post},
	})
	resolved, err := svc.ResolvePublishedPost(context.Background(), "112")
	if err != nil || resolved.ID != post.ID {
		t.Fatalf("ResolvePublishedPost = %#v, %v; want numeric slug post", resolved, err)
	}
}
