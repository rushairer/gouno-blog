package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRSSUsesCanonicalArticleLinksAndForwardedOrigin(t *testing.T) {
	svc := newFakeBlogService()
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
	svc := newFakeBlogService()
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

func setupFeedRouter(svc *fakeBlogService) http.Handler {
	router := setupControllerRouter(svc)
	feed := NewFeedController(svc, nil, nil)
	router.GET("/feed.xml", feed.GetRSS)
	router.GET("/sitemap.xml", feed.GetSitemap)
	return router
}
