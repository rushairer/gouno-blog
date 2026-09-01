package authbff

import (
	"github.com/golang-jwt/jwt/v5"
	"net/url"
	"testing"
	"time"
)

func TestSafeReturnToRejectsOpenRedirects(t *testing.T) {
	for _, value := range []string{"https://evil.example/", "//evil.example/", "admin", "javascript:alert(1)", "/\\\\evil.example/", "/%5c%5cevil.example/", "/%2f%2fevil.example/"} {
		if _, err := SafeReturnTo(value); err == nil {
			t.Fatalf("unsafe return_to accepted: %q", value)
		}
	}
	for _, value := range []string{"/", "/admin", "/articles?q=oidc"} {
		if got, err := SafeReturnTo(value); err != nil || got != value {
			t.Fatalf("safe return_to rejected: %q => %q, %v", value, got, err)
		}
	}
}

func TestLogoutTokenRequiresExplicitTypeAndRecentIssuedAt(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"iat": now.Unix()})
	token.Header["typ"] = "logout+jwt"
	raw, err := token.SignedString([]byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	if err := validateLogoutTokenType(raw); err != nil {
		t.Fatalf("explicit logout JWT type was rejected: %v", err)
	}
	token.Header["typ"] = "JWT"
	raw, _ = token.SignedString([]byte("test-only-secret"))
	if err := validateLogoutTokenType(raw); err == nil {
		t.Fatal("generic JWT type was accepted as a logout token")
	}
	for _, issuedAt := range []time.Time{now.Add(-6 * time.Minute), now.Add(2 * time.Minute)} {
		if err := validateLogoutTokenIssuedAt(issuedAt.Unix(), now); err == nil {
			t.Fatalf("out-of-window logout token iat was accepted: %v", issuedAt)
		}
	}
	if err := validateLogoutTokenIssuedAt(now.Unix(), now); err != nil {
		t.Fatalf("recent logout token iat was rejected: %v", err)
	}
}

func TestAuthorizationResponseRequiresExactIssuerAndState(t *testing.T) {
	query := url.Values{"iss": {"https://sso.local.test"}, "state": {"state"}}
	if !constantTimeEqual(query.Get("iss"), "https://sso.local.test") || !constantTimeEqual(query.Get("state"), "state") {
		t.Fatal("exact response values must compare equal")
	}
	if constantTimeEqual(query.Get("iss"), "https://io84.com") || constantTimeEqual("", "") {
		t.Fatal("issuer mismatch or empty value must not compare equal")
	}
}
