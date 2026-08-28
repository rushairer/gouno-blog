package authbff

import (
	"net/url"
	"testing"
)

func TestSafeReturnToRejectsOpenRedirects(t *testing.T) {
	for _, value := range []string{"https://evil.example/", "//evil.example/", "admin", "javascript:alert(1)"} {
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

func TestAuthorizationResponseRequiresExactIssuerAndState(t *testing.T) {
	query := url.Values{"iss": {"https://sso.local.test"}, "state": {"state"}}
	if !constantTimeEqual(query.Get("iss"), "https://sso.local.test") || !constantTimeEqual(query.Get("state"), "state") {
		t.Fatal("exact response values must compare equal")
	}
	if constantTimeEqual(query.Get("iss"), "https://io84.com") || constantTimeEqual("", "") {
		t.Fatal("issuer mismatch or empty value must not compare equal")
	}
}
