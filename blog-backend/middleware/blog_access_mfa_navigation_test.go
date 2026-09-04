package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func recentMFATestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("claims", jwt.MapClaims{
			"auth_time": time.Now().Add(-11 * time.Minute).Unix(),
			"amr":       []string{"totp"},
		})
		c.Next()
	})
	r.Use(RequireRecentMFA())
	r.GET("/protected", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	return r
}

func TestRequireRecentMFARedirectsDocumentNavigationToStepUpUI(t *testing.T) {
	r := recentMFATestRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Dest", "document")

	r.ServeHTTP(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("status=%d want=%d", w.Code, http.StatusSeeOther)
	}
	if location := w.Header().Get("Location"); location != "/admin/ai-ops?mfa_step_up=1" {
		t.Fatalf("location=%q", location)
	}
}

func TestRequireRecentMFAKeepsFetchCallOnAPIErrorPath(t *testing.T) {
	r := recentMFATestRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Accept", "application/json")

	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d want=%d", w.Code, http.StatusForbidden)
	}
	if !strings.Contains(w.Body.String(), "recent multi-factor authentication required") {
		t.Fatalf("unexpected body: %s", w.Body.String())
	}
}
