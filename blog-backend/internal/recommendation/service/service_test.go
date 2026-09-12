package service

import (
	"context"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type stubRepository struct {
	called bool
	postID int64
	tags   []string
	limit  int
	posts  []*domain.Post
	err    error
}

func (r *stubRepository) RelatedPosts(_ context.Context, postID int64, tags []string, limit int) ([]*domain.Post, error) {
	r.called = true
	r.postID = postID
	r.tags = append([]string(nil), tags...)
	r.limit = limit
	return r.posts, r.err
}

func TestRelatedPostsValidatesPostAndTags(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)

	if _, err := svc.RelatedPosts(context.Background(), nil); !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("nil post error=%v, want ErrPostNotFound", err)
	}
	if repo.called {
		t.Fatal("invalid post reached repository")
	}

	posts, err := svc.RelatedPosts(context.Background(), &domain.Post{ID: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 0 || repo.called {
		t.Fatalf("tagless post result=%#v repo.called=%v, want empty without repository call", posts, repo.called)
	}
}

func TestRelatedPostsDelegatesWithBoundedLimit(t *testing.T) {
	expected := []*domain.Post{{ID: 9, Title: "Related"}}
	repo := &stubRepository{posts: expected}
	svc := New(repo)

	got, err := svc.RelatedPosts(context.Background(), &domain.Post{ID: 7, Tags: []string{"go", "testing"}})
	if err != nil {
		t.Fatal(err)
	}
	if !repo.called || repo.postID != 7 || repo.limit != 4 {
		t.Fatalf("repo call=(called=%v postID=%d limit=%d), want true,7,4", repo.called, repo.postID, repo.limit)
	}
	if len(repo.tags) != 2 || repo.tags[0] != "go" || repo.tags[1] != "testing" {
		t.Fatalf("repo tags=%v", repo.tags)
	}
	if len(got) != 1 || got[0] != expected[0] {
		t.Fatalf("result=%#v, want original posts", got)
	}
}

func TestRelatedPostsPreservesRepositoryError(t *testing.T) {
	repoErr := errors.New("query failed")
	repo := &stubRepository{err: repoErr}
	_, err := New(repo).RelatedPosts(context.Background(), &domain.Post{ID: 7, Tags: []string{"go"}})
	if !errors.Is(err, repoErr) {
		t.Fatalf("error=%v, want repository error", err)
	}
}
