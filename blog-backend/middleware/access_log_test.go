package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestSafeAccessLogFormatterExcludesOAuthQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback?code=secret-code&state=secret-state", nil)
	line := SafeAccessLogFormatter(gin.LogFormatterParams{
		TimeStamp: time.Unix(0, 0), StatusCode: http.StatusSeeOther,
		Request: req, Method: req.Method, Path: req.URL.RequestURI(),
	})
	for _, secret := range []string{"secret-code", "secret-state", "code=", "state="} {
		if strings.Contains(line, secret) {
			t.Fatalf("access log leaked OAuth query data: %q", line)
		}
	}
}
