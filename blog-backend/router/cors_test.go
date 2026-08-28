package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

func TestCORSMiddlewareRejectsUntrustedUnsafeOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CORSMiddleware(nil))
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
	router.Use(middleware.CORSMiddleware([]string{"https://console.example.test"}))
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

func TestCORSMiddlewareTreatsExplicitPortAsSameOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CORSMiddleware(nil))
	router.POST("/api/posts", func(c *gin.Context) { c.Status(http.StatusCreated) })

	req := httptest.NewRequest(http.MethodPost, "http://blog.test:8080/api/posts", nil)
	req.Host = "blog.test:8080"
	req.Header.Set("Origin", "http://blog.test:8080")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected same-origin request with port to pass, got %d", response.Code)
	}
}

func TestCORSMiddlewareAllowsForwardedHTTPSLocalhostOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CORSMiddleware(nil))
	router.POST("/api/posts", func(c *gin.Context) { c.Status(http.StatusCreated) })

	req := httptest.NewRequest(http.MethodPost, "http://blog-backend:8082/api/posts", nil)
	req.Host = "localhost:8443"
	req.Header.Set("Origin", "https://localhost:8443")
	req.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected forwarded HTTPS origin to pass, got %d", response.Code)
	}
}

func TestCORSMiddlewareRejectsSpoofedForwardedHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CORSMiddleware(nil))
	router.POST("/api/admin/provider-profiles/1/test", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodPost, "http://blog-backend:8082/api/admin/provider-profiles/1/test", nil)
	req.Host = "blog-backend:8082"
	req.Header.Set("Origin", "http://attacker.example.test")
	req.Header.Set("X-Forwarded-Host", "attacker.example.test")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected spoofed forwarded host to be rejected, got %d", response.Code)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected allow-origin = %q", got)
	}
}
