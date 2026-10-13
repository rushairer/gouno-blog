package authbff

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBackchannelLogoutFailureNeverLeaksVerifierOrStoreErrors(t *testing.T) {
	const marker = "private-upstream-jwt-redis-sentinel"
	cases := []struct {
		name, expectedDescription string
		err                       error
	}{
		{"untrusted-token", errors.New("verify logout token: " + marker), "invalid logout token"},
		{"redis-claim-failed", errors.Join(ErrBackchannelStoreFailure, errors.New(marker)), "logout request could not be completed"},
		{"concurrent-claim", errors.Join(ErrBackchannelInProgress, errors.New(marker)), "logout request could not be completed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			writeBackchannelLogoutFailure(ctx, tc.err)

			if rec.Code != http.StatusBadRequest || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("OIDC backchannel failure contract changed: status=%d cache=%q",
					rec.Code, rec.Header().Get("Cache-Control"))
			}
			var body map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body["error"] != "invalid_request" || body["error_description"] != tc.expectedDescription {
				t.Fatalf("backchannel response changed: %#v", body)
			}
			if strings.Contains(rec.Body.String(), marker) || strings.Contains(rec.Body.String(), "redis") ||
				strings.Contains(rec.Body.String(), "verify") {
				t.Fatalf("untrusted or infrastructure error details leaked in HTTP response: %s", rec.Body.String())
			}
		})
	}
}

func TestBackchannelLogoutRequiresTokenWithNoStoreAccess(t *testing.T) {
	client, _ := testBFFClientWithStore(t)
	router := gin.New()
	client.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/backchannel-logout", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("missing token contract changed: status=%d cache=%q", rec.Code, rec.Header().Get("Cache-Control"))
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != "invalid_request" || body["error_description"] != "logout_token is required" {
		t.Fatalf("missing token response changed: %#v", body)
	}
}
