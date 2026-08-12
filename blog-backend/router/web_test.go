package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/middleware"
)

func TestRegisterWebRouterDoesNotConflictOnPostWildcards(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("route registration panicked: %v", recovered)
		}
	}()
	RegisterWebRouter(engine, nil, middleware.AuthOptions{
		Issuer: "http://issuer.test", Audience: "blog-spa", ClientID: "blog-spa",
	}, "http://127.0.0.1:1/jwks", "", "test-secret", t.TempDir(), media.NewLocal(t.TempDir()), nil, nil)

	foundUpdate := false
	foundLike := false
	foundRelated := false
	foundAnalytics := false
	foundMedia := false
	foundHealth := false
	for _, route := range engine.Routes() {
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID" {
			foundUpdate = true
		}
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID/like" {
			foundLike = true
		}
		if route.Method == "GET" && route.Path == "/api/posts/:slugOrID/related" {
			foundRelated = true
		}
		if route.Method == "GET" && route.Path == "/api/admin/analytics" {
			foundAnalytics = true
		}
		if route.Method == "GET" && route.Path == "/media/:filename" {
			foundMedia = true
		}
		if route.Method == "GET" && route.Path == "/healthz" {
			foundHealth = true
		}
	}
	if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth {
		t.Fatalf("expected growth routes, update=%v like=%v related=%v analytics=%v media=%v health=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth)
	}
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("health status=%d, want %d when database is unavailable", response.Code, http.StatusServiceUnavailable)
	}
}
