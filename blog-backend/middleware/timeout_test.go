package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestTimeoutMiddlewareWithOverridesExtendsProviderTestsOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(TimeoutMiddlewareWithOverrides(10*time.Millisecond, map[string]time.Duration{
		"provider_test": 100 * time.Millisecond,
	}))
	handler := func(ctx *gin.Context) {
		time.Sleep(30 * time.Millisecond)
		ctx.Status(http.StatusNoContent)
	}
	router.POST("/api/admin/provider-profiles/:id/test", handler)
	router.GET("/health", handler)

	providerTest := httptest.NewRecorder()
	router.ServeHTTP(providerTest, httptest.NewRequest(http.MethodPost, "/api/admin/provider-profiles/4/test", nil))
	if providerTest.Code != http.StatusNoContent {
		t.Fatalf("provider test status = %d, want 204; body=%s", providerTest.Code, providerTest.Body.String())
	}

	ordinaryRequest := httptest.NewRecorder()
	router.ServeHTTP(ordinaryRequest, httptest.NewRequest(http.MethodGet, "/health", nil))
	if ordinaryRequest.Code != http.StatusRequestTimeout {
		t.Fatalf("ordinary request status = %d, want 408; body=%s", ordinaryRequest.Code, ordinaryRequest.Body.String())
	}
}
