package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
)

type stubService struct {
	post  *domain.Post
	posts []*domain.Post
}

func (s *stubService) RelatedPosts(_ context.Context, post *domain.Post) ([]*domain.Post, error) {
	s.post = post
	return s.posts, nil
}

type stubResolver struct {
	key  string
	post *domain.Post
}

func (r *stubResolver) ResolvePublishedPost(_ context.Context, key string) (*domain.Post, error) {
	r.key = key
	return r.post, nil
}

func TestRelatedPostsResolvesSlugBeforeCallingService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	post := &domain.Post{ID: 7, Slug: "hello-world", Tags: []string{"go"}}
	resolver := &stubResolver{post: post}
	svc := &stubService{posts: []*domain.Post{{ID: 9}}}
	ctrl := New(svc, resolver)
	engine := gin.New()
	engine.GET("/api/posts/:slugOrID/related", ctrl.RelatedPosts)

	resp := httptest.NewRecorder()
	engine.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/api/posts/hello-world/related", nil))

	if resp.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Code, http.StatusOK)
	}
	if resolver.key != "hello-world" {
		t.Fatalf("resolver key=%q, want hello-world", resolver.key)
	}
	if svc.post != post {
		t.Fatalf("service post=%#v, want resolved post", svc.post)
	}
}
