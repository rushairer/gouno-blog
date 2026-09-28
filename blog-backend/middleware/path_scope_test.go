package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSkipPathPrefixesOnlyBypassesExplicitSurface(t *testing.T) {
	gin.SetMode(gin.TestMode)
	blockedCalls := 0
	scoped := SkipPathPrefixes(func(c *gin.Context) {
		blockedCalls++
		c.AbortWithStatus(http.StatusTooManyRequests)
	}, "/api/external/v1/")

	router := gin.New()
	router.Use(scoped)
	router.GET("/api/external/v1/capabilities", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.GET("/api/admin/provider-profiles", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	external := httptest.NewRecorder()
	router.ServeHTTP(
		external,
		httptest.NewRequest(http.MethodGet, "/api/external/v1/capabilities", nil),
	)
	if external.Code != http.StatusNoContent {
		t.Fatalf("external status = %d", external.Code)
	}
	if blockedCalls != 0 {
		t.Fatalf("global middleware unexpectedly ran for external route: %d", blockedCalls)
	}

	admin := httptest.NewRecorder()
	router.ServeHTTP(
		admin,
		httptest.NewRequest(http.MethodGet, "/api/admin/provider-profiles", nil),
	)
	if admin.Code != http.StatusTooManyRequests {
		t.Fatalf("admin status = %d", admin.Code)
	}
	if blockedCalls != 1 {
		t.Fatalf("global middleware calls = %d", blockedCalls)
	}
}

func TestSkipPathPrefixesDoesNotMatchNearPrefix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	calls := 0
	scoped := SkipPathPrefixes(func(c *gin.Context) {
		calls++
		c.AbortWithStatus(http.StatusTooManyRequests)
	}, "/api/external/v1/")

	router := gin.New()
	router.Use(scoped)
	router.GET("/api/external/v10/capabilities", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/external/v10/capabilities", nil),
	)
	if response.Code != http.StatusTooManyRequests || calls != 1 {
		t.Fatalf("status=%d calls=%d", response.Code, calls)
	}
}
