package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSMiddlewareRejectsUntrustedUnsafeOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(corsMiddleware(nil))
	router.POST("/api/posts", func(c *gin.Context) { c.Status(http.StatusCreated) })

	req := httptest.NewRequest(http.MethodPost, "http://blog.test/api/posts", nil)
	req.Header.Set("Origin", "https://evil.test")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden cross-origin write, got %d", response.Code)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected allow-origin header %q", got)
	}
}

func TestCORSMiddlewareAllowsSameOriginAndConfiguredOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(corsMiddleware([]string{"https://console.example.test"}))
	router.POST("/api/posts", func(c *gin.Context) { c.Status(http.StatusCreated) })

	for _, origin := range []string{"http://blog.test", "https://console.example.test"} {
		req := httptest.NewRequest(http.MethodPost, "http://blog.test/api/posts", nil)
		req.Header.Set("Origin", origin)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Code != http.StatusCreated {
			t.Fatalf("origin %q: expected created, got %d", origin, response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("origin %q: allow-origin = %q", origin, got)
		}
	}
}
