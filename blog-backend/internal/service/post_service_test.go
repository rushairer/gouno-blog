package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

type fakePostRepo struct {
	posts       map[int64]*domain.Post
	postsBySlug map[string]*domain.Post
	comments    map[int64][]*domain.Comment
	lastLimit   int
	lastOffset  int
	updateErr   error
	deleteErr   error
}

func newFakePostRepo() *fakePostRepo {
	return &fakePostRepo{
		posts:       make(map[int64]*domain.Post),
		postsBySlug: make(map[string]*domain.Post),
		comments:    make(map[int64][]*domain.Comment),
	}
}

func (r *fakePostRepo) Create(_ context.Context, post *domain.Post) error {
	post.ID = int64(len(r.posts) + 1)
	r.posts[post.ID] = post
	r.postsBySlug[post.Slug] = post
	return nil
}

func (r *fakePostRepo) Update(_ context.Context, post *domain.Post) error {
	if r.updateErr != nil {
		return r.updateErr
	}
	r.posts[post.ID] = post
	r.postsBySlug[post.Slug] = post
	return nil
}

func (r *fakePostRepo) Delete(_ context.Context, id int64) error {
	if r.deleteErr != nil {
		return r.deleteErr
	}
	delete(r.posts, id)
	return nil
}

func (r *fakePostRepo) GetByID(_ context.Context, id int64) (*domain.Post, error) {
	return r.posts[id], nil
}

func (r *fakePostRepo) GetBySlug(_ context.Context, slug string) (*domain.Post, error) {
	return r.postsBySlug[slug], nil
}

func (r *fakePostRepo) List(_ context.Context, _ string, limit, offset int) ([]*domain.Post, int, error) {
	r.lastLimit = limit
	r.lastOffset = offset
	posts := make([]*domain.Post, 0, len(r.posts))
	for _, post := range r.posts {
		posts = append(posts, post)
	}
	return posts, len(posts), nil
}

func (r *fakePostRepo) ListAdmin(_ context.Context, limit, offset int) ([]*domain.Post, int, error) {
	return r.List(context.Background(), "", limit, offset)
}

func (r *fakePostRepo) PublishScheduled(context.Context) (int64, error) { return 0, nil }

func (r *fakePostRepo) ListTags(context.Context) ([]string, error) {
	return []string{"go"}, nil
}

func (r *fakePostRepo) CreateComment(_ context.Context, comment *domain.Comment) error {
	r.comments[comment.PostID] = append(r.comments[comment.PostID], comment)
	return nil
}

func (r *fakePostRepo) GetVisibleCommentsByPostID(_ context.Context, postID int64) ([]*domain.Comment, error) {
	comments := make([]*domain.Comment, 0)
	for _, comment := range r.comments[postID] {
		if comment.IsVisible {
			comments = append(comments, comment)
		}
	}
	return comments, nil
}

func (r *fakePostRepo) GetAllCommentsByPostID(_ context.Context, postID int64) ([]*domain.Comment, error) {
	return r.comments[postID], nil
}

func (r *fakePostRepo) SetCommentVisibility(_ context.Context, id int64, isVisible bool) error {
	for _, comments := range r.comments {
		for _, comment := range comments {
			if comment.ID == id {
				comment.IsVisible = isVisible
				return nil
			}
		}
	}
	return sql.ErrNoRows
}

func (r *fakePostRepo) DeleteComment(context.Context, int64) error {
	return nil
}

func TestCreatePostNormalizesSlugAndSummary(t *testing.T) {
	repo := newFakePostRepo()
	svc := NewPostService(repo)
	post := &domain.Post{
		Title:   "Hello GoUno Blog",
		Content: "# Hello\nThis is a **long** enough post body.",
		Tags:    []string{"go"},
	}

	if err := svc.CreatePost(context.Background(), post); err != nil {
		t.Fatalf("CreatePost returned error: %v", err)
	}

	if post.Slug != "hello-gouno-blog" {
		t.Fatalf("slug = %q, want normalized slug", post.Slug)
	}
	if post.Summary == "" || post.Summary == post.Content {
		t.Fatalf("summary was not generated from markdown content: %q", post.Summary)
	}
}

func TestCreatePostAppendsSuffixForDuplicateSlug(t *testing.T) {
	repo := newFakePostRepo()
	existing := &domain.Post{ID: 1, Title: "Existing", Slug: "hello"}
	repo.posts[existing.ID] = existing
	repo.postsBySlug[existing.Slug] = existing
	svc := NewPostService(repo)
	post := &domain.Post{Title: "Hello", Slug: "hello", Content: "Body"}

	if err := svc.CreatePost(context.Background(), post); err != nil {
		t.Fatalf("CreatePost returned error: %v", err)
	}
	if post.Slug == "hello" {
		t.Fatal("expected duplicate slug to receive a suffix")
	}
}

func TestUpdatePostRejectsSlugUsedByAnotherPost(t *testing.T) {
	repo := newFakePostRepo()
	repo.posts[1] = &domain.Post{ID: 1, Title: "Current", Slug: "current", Status: domain.PostStatusDraft}
	repo.postsBySlug["taken"] = &domain.Post{ID: 42, Slug: "taken"}
	svc := NewPostService(repo)

	err := svc.UpdatePost(context.Background(), &domain.Post{ID: 1, Title: "Title", Slug: "taken", Content: "Body"})
	if !errors.Is(err, ErrSlugInUse) {
		t.Fatalf("error = %v, want ErrSlugInUse", err)
	}
}

func TestListPostsNormalizesPagination(t *testing.T) {
	repo := newFakePostRepo()
	svc := NewPostService(repo)

	if _, _, err := svc.ListPosts(context.Background(), "", 0, 0); err != nil {
		t.Fatalf("ListPosts returned error: %v", err)
	}
	if repo.lastLimit != 10 || repo.lastOffset != 0 {
		t.Fatalf("limit/offset = %d/%d, want 10/0", repo.lastLimit, repo.lastOffset)
	}
}

func TestResolvePostIDSupportsNumericIDAndSlug(t *testing.T) {
	repo := newFakePostRepo()
	post := &domain.Post{ID: 7, Slug: "hello-world", Status: domain.PostStatusPublished}
	repo.posts[post.ID] = post
	repo.postsBySlug[post.Slug] = post
	svc := NewPostService(repo)

	id, err := svc.ResolvePostID(context.Background(), "7")
	if err != nil || id != 7 {
		t.Fatalf("ResolvePostID by id = %d, %v; want 7, nil", id, err)
	}

	id, err = svc.ResolvePostID(context.Background(), "hello-world")
	if err != nil || id != 7 {
		t.Fatalf("ResolvePostID by slug = %d, %v; want 7, nil", id, err)
	}
}

func TestScheduledPostRequiresFutureShanghaiTime(t *testing.T) {
	svc := NewPostService(newFakePostRepo())
	past := time.Now().Add(-time.Minute)
	err := svc.CreatePost(context.Background(), &domain.Post{Title: "Later", Content: "Body", Status: domain.PostStatusScheduled, ScheduledAt: &past})
	if err == nil || err.Error() != "scheduled_at must be in the future" {
		t.Fatalf("CreatePost error = %v, want future schedule validation", err)
	}
}

func TestPublicReadsHideNonPublishedPosts(t *testing.T) {
	repo := newFakePostRepo()
	repo.posts[1] = &domain.Post{ID: 1, Slug: "draft", Status: domain.PostStatusDraft}
	repo.postsBySlug["draft"] = repo.posts[1]
	post, err := NewPostService(repo).GetPostBySlug(context.Background(), "draft")
	if err != nil || post != nil {
		t.Fatalf("GetPostBySlug = %#v, %v; want hidden draft", post, err)
	}
}

func TestCommentValidation(t *testing.T) {
	svc := NewPostService(newFakePostRepo())

	err := svc.CreateComment(context.Background(), &domain.Comment{PostID: 1, Author: "", Content: "Body"})
	if err == nil || err.Error() != "comment author cannot be empty" {
		t.Fatalf("CreateComment error = %v, want author validation", err)
	}

	err = svc.DeletePost(context.Background(), 1)
	if err != nil {
		t.Fatalf("DeletePost returned error: %v", err)
	}

	repo := newFakePostRepo()
	repo.deleteErr = sql.ErrNoRows
	err = NewPostService(repo).DeletePost(context.Background(), 99)
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("DeletePost error = %v, want ErrPostNotFound", err)
	}
}

func TestCommentsDefaultToModeratedVisibility(t *testing.T) {
	repo := newFakePostRepo()
	repo.comments[1] = []*domain.Comment{
		{ID: 1, PostID: 1, Author: "Ada", Content: "Visible", IsVisible: true},
		{ID: 2, PostID: 1, Author: "Grace", Content: "Pending", IsVisible: false},
	}
	svc := NewPostService(repo)

	publicComments, err := svc.GetComments(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetComments returned error: %v", err)
	}
	if len(publicComments) != 1 || publicComments[0].Content != "Visible" {
		t.Fatalf("public comments = %#v, want only visible comment", publicComments)
	}

	adminComments, err := svc.GetAllComments(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetAllComments returned error: %v", err)
	}
	if len(adminComments) != 2 {
		t.Fatalf("admin comments length = %d, want 2", len(adminComments))
	}

	if err := svc.SetCommentVisibility(context.Background(), 2, true); err != nil {
		t.Fatalf("SetCommentVisibility returned error: %v", err)
	}
	publicComments, _ = svc.GetComments(context.Background(), 1)
	if len(publicComments) != 2 {
		t.Fatalf("public comments length after approval = %d, want 2", len(publicComments))
	}
}
