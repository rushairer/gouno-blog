package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
)

type fakeFeedPostReader struct {
	posts []*domain.Post
}

func newFakeFeedPostReader() *fakeFeedPostReader {
	return &fakeFeedPostReader{posts: []*domain.Post{{
		ID:      1,
		Title:   "Hello",
		Slug:    "hello",
		Content: "Body",
		Status:  domain.PostStatusPublished,
	}}}
}

func (s *fakeFeedPostReader) ListPosts(context.Context, string, string, int, int) ([]*domain.Post, int, error) {
	return s.posts, len(s.posts), nil
}

func TestRSSUsesCanonicalArticleLinksAndForwardedOrigin(t *testing.T) {
	svc := newFakeFeedPostReader()
	router := setupFeedRouter(svc)
	request := httptest.NewRequest(http.MethodGet, "/feed.xml", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	request.Header.Set("X-Forwarded-Host", "blog.example.com")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
	if contentType := response.Header().Get("Content-Type"); !strings.Contains(contentType, "application/xml") {
		t.Fatalf("expected XML content type, got %q", contentType)
	}
	body := response.Body.String()
	if !strings.Contains(body, "https://blog.example.com/articles/hello") {
		t.Fatalf("expected canonical article URL, got %s", body)
	}
	if strings.Contains(body, "/posts/hello") {
		t.Fatalf("feed still contains legacy post URL: %s", body)
	}
}

func TestSitemapContainsPublicIndexRoutes(t *testing.T) {
	svc := newFakeFeedPostReader()
	router := setupFeedRouter(svc)
	request := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	body := response.Body.String()
	for _, path := range []string{"/articles", "/categories", "/tags", "/archive", "/about", "/articles/hello"} {
		if !strings.Contains(body, path) {
			t.Fatalf("sitemap is missing %s: %s", path, body)
		}
	}
}

func setupFeedRouter(svc FeedPostReader) http.Handler {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	feed := NewFeedController(svc, nil, nil)
	router.GET("/feed.xml", feed.GetRSS)
	router.GET("/sitemap.xml", feed.GetSitemap)
	return router
}
