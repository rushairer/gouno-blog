package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestRequireRecentMFAForUnsafeMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, method string
		claims       jwt.MapClaims
		want         int
	}{
		{name: "read accepts AAL2 baseline", method: http.MethodGet, want: http.StatusNoContent},
		{name: "write rejects stale session", method: http.MethodPost, claims: jwt.MapClaims{"auth_time": time.Now().Add(-11 * time.Minute).Unix(), "amr": []string{"totp"}}, want: http.StatusForbidden},
		{name: "write accepts recent MFA", method: http.MethodPost, claims: jwt.MapClaims{"auth_time": time.Now().Unix(), "amr": []string{"totp"}}, want: http.StatusNoContent},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.Use(func(c *gin.Context) {
				if tc.claims != nil {
					c.Set("claims", tc.claims)
				}
				c.Next()
			})
			r.Use(RequireRecentMFAForUnsafeMethods())
			r.Handle(tc.method, "/test", func(c *gin.Context) { c.Status(http.StatusNoContent) })
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(tc.method, "/test", nil))
			if w.Code != tc.want {
				t.Fatalf("status=%d want=%d", w.Code, tc.want)
			}
		})
	}
}
