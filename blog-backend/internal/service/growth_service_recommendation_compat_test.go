package service

import (
	"context"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type growthRecommendationCompatStore struct {
	called bool
	postID int64
	tags   []string
	limit  int
	posts  []*domain.Post
}

func (s *growthRecommendationCompatStore) RelatedPosts(_ context.Context, postID int64, tags []string, limit int) ([]*domain.Post, error) {
	s.called = true
	s.postID = postID
	s.tags = append([]string(nil), tags...)
	s.limit = limit
	return s.posts, nil
}

func (s *growthRecommendationCompatStore) ListVersions(context.Context, int64) ([]*domain.PostVersion, error) {
	return nil, nil
}

func (s *growthRecommendationCompatStore) RestoreVersion(context.Context, int64, int64) (*domain.Post, error) {
	return nil, nil
}

func TestGrowthServicePreservesRecommendationCompatibility(t *testing.T) {
	store := &growthRecommendationCompatStore{posts: []*domain.Post{{ID: 9}}}
	svc := NewGrowthService(store)

	if _, err := svc.RelatedPosts(context.Background(), nil); err != ErrPostNotFound {
		t.Fatalf("nil post error=%v, want legacy ErrPostNotFound", err)
	}
	if store.called {
		t.Fatal("invalid post reached compatibility store")
	}

	posts, err := svc.RelatedPosts(context.Background(), &domain.Post{ID: 7, Tags: []string{"go"}})
	if err != nil {
		t.Fatal(err)
	}
	if !store.called || store.postID != 7 || store.limit != 4 {
		t.Fatalf("store call=(called=%v postID=%d limit=%d), want true,7,4", store.called, store.postID, store.limit)
	}
	if len(posts) != 1 || posts[0].ID != 9 {
		t.Fatalf("posts=%#v, want related post", posts)
	}
}
