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
	postID   int64
	actorKey string
	summary  *domain.AnalyticsSummary
}

func (s *stubService) RecordView(_ context.Context, postID int64, actorKey string) error {
	s.postID = postID
	s.actorKey = actorKey
	return nil
}

func (s *stubService) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	return s.summary, nil
}

type stubResolver struct {
	key  string
	post *domain.Post
}

func (r *stubResolver) ResolvePublishedPost(_ context.Context, key string) (*domain.Post, error) {
	r.key = key
	return r.post, nil
}

func TestTrackViewResolvesSlugOrIDBeforeRecording(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &stubService{}
	resolver := &stubResolver{post: &domain.Post{ID: 42}}
	ctrl := New(svc, resolver)
	engine := gin.New()
	engine.POST("/api/posts/:slugOrID/view", ctrl.TrackView)

	req := httptest.NewRequest(http.MethodPost, "/api/posts/hello-world/view", nil)
	req.Header.Set("User-Agent", "analytics-test")
	resp := httptest.NewRecorder()
	engine.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", resp.Code, http.StatusOK)
	}
	if resolver.key != "hello-world" {
		t.Fatalf("resolver key=%q, want hello-world", resolver.key)
	}
	if svc.postID != 42 {
		t.Fatalf("recorded post id=%d, want 42", svc.postID)
	}
	if svc.actorKey == "" {
		t.Fatal("actor key must be populated")
	}
}
