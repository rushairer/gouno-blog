package controller

import (
	"context"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeFeedPostReader struct {
	posts []*postdomain.Post
}

func newFakeFeedPostReader() *fakeFeedPostReader {
	return &fakeFeedPostReader{posts: []*postdomain.Post{{
		ID:      1,
		Title:   "Hello",
		Slug:    "hello",
		Content: "Body",
		Status:  postdomain.PostStatusPublished,
	}}}
}

func (s *fakeFeedPostReader) ListPosts(context.Context, string, string, int, int) ([]*postdomain.Post, int, error) {
	return s.posts, len(s.posts), nil
}

func TestRSSUsesConfiguredCanonicalOriginEvenWithSpoofedForwardedHost(t *testing.T) {
	svc := newFakeFeedPostReader()
	router := setupFeedRouter(svc, "https://blog.example.com/api/auth/callback")
	request := httptest.NewRequest(http.MethodGet, "/feed.xml", nil)
	request.Host = "malicious.example.test"
	request.Header.Set("X-Forwarded-Proto", "http")
	request.Header.Set("X-Forwarded-Host", "malicious.example.test")
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
	if strings.Contains(body, "malicious.example.test") {
		t.Fatalf("request-supplied host leaked into feed: %s", body)
	}
}

func TestSitemapContainsPublicIndexRoutes(t *testing.T) {
	svc := newFakeFeedPostReader()
	router := setupFeedRouter(svc, "https://blog.example.com/api/auth/callback")
	request := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
	request.Host = "bad.example.test"
	request.Header.Set("X-Forwarded-Host", "bad.example.test")
	request.Header.Set("X-Forwarded-Proto", "http")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	body := response.Body.String()
	if !strings.Contains(body, "https://blog.example.com/articles/hello") || strings.Contains(body, "bad.example.test") {
		t.Fatalf("sitemap origin does not match configured callback: %s", body)
	}
	for _, path := range []string{"/articles", "/categories", "/tags", "/archive", "/about", "/articles/hello"} {
		if !strings.Contains(body, path) {
			t.Fatalf("sitemap is missing %s: %s", path, body)
		}
	}
}

func setupFeedRouter(svc FeedPostReader, oidcCallbackURL string) http.Handler {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	feed := NewFeedController(svc, nil, nil, oidcCallbackURL)
	router.GET("/feed.xml", feed.GetRSS)
	router.GET("/sitemap.xml", feed.GetSitemap)
	return router
}

func TestFeedOriginRejectsInvalidConfigurationAndUntrustedHost(t *testing.T) {
	for name, callback := range map[string]string{
		"empty":           "",
		"http-scheme":     "http://blog.example.com/api/auth/callback",
		"userinfo":        "https://user:password@blog.example.com/api/auth/callback",
		"query":           "https://blog.example.com/api/auth/callback?next=evil",
		"fragment":        "https://blog.example.com/api/auth/callback#evil",
		"wrong-path":      "https://blog.example.com/login",
		"relative":        "//malicious.example.test/api/auth/callback",
		"javascript":      "javascript:alert(1)",
		"encoded-callback": "https://blog.example.com/api/auth/%63allback",
	} {
		t.Run(name, func(t *testing.T) {
			router := setupFeedRouter(newFakeFeedPostReader(), callback)
			request := httptest.NewRequest(http.MethodGet, "/feed.xml", nil)
			request.Host = "malicious.example.test"
			request.Header.Set("X-Forwarded-Host", "malicious.example.test")
			request.Header.Set("X-Forwarded-Proto", "https")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("status=%d, want 200", response.Code)
			}
			body := response.Body.String()
			if !strings.Contains(body, "https://blog.dev.local/articles/hello") {
				t.Fatalf("missing fail-closed development origin: %s", body)
			}
			if strings.Contains(body, "malicious.example.test") || strings.Contains(body, "javascript:") {
				t.Fatalf("untrusted origin leaked: %s", body)
			}
		})
	}
}
