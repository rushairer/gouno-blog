package router

import (
	"testing"

	"github.com/gin-gonic/gin"
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
	}, "http://127.0.0.1:1/jwks", "", "test-secret", t.TempDir())

	foundUpdate := false
	foundLike := false
	foundRelated := false
	foundAnalytics := false
	foundMedia := false
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
	}
	if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia {
		t.Fatalf("expected growth routes, update=%v like=%v related=%v analytics=%v media=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia)
	}
}
