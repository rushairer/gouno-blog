package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

func TestBlogCSRFRejectsUnsafeRequestWithoutMatchingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.BlogCSRFMiddleware(false))
	router.POST("/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	req := httptest.NewRequest(http.MethodPost, "/write", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d", response.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/write", nil)
	req.AddCookie(&http.Cookie{Name: middleware.BlogCSRFCookie, Value: "token"})
	req.Header.Set("X-CSRF-Token", "token")
	response = httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestBlogCSRFRejectsBearerRequestWithoutMatchingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.BlogCSRFMiddleware(false))
	router.POST("/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodPost, "/write", nil)
	req.Header.Set("Authorization", "Bearer explicit-token")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestBlogCSRFIssuesSecureCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.BlogCSRFMiddleware(true))
	router.GET("/read", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	req := httptest.NewRequest(http.MethodGet, "/read", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d", response.Code)
	}
	cookie := response.Result().Cookies()
	if len(cookie) != 1 || cookie[0].Name != middleware.BlogCSRFCookie || !cookie[0].Secure {
		t.Fatalf("expected a secure %s cookie, got %#v", middleware.BlogCSRFCookie, cookie)
	}
}


func TestBlogCSRFAllowsExplicitExternalCapabilityMachineRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.BlogCSRFMiddleware(false))
	router.POST("/api/external/v1/capabilities/:name/invoke", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/external/v1/capabilities/content.list_posts/invoke",
		nil,
	)
	req.Header.Set("Authorization", "Bearer gouno_live_explicit-machine-key")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestBlogCSRFDoesNotGeneralizeMachineExemptionToBrowserAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.BlogCSRFMiddleware(false))
	router.POST("/api/admin/provider-profiles", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/admin/provider-profiles", nil)
	req.Header.Set("Authorization", "Bearer gouno_live_explicit-machine-key")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d", response.Code)
	}
}
