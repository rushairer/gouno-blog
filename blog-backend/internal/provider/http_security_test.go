package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestGeminiRequestKeepsAPIKeyOutOfURLAndAuthorization(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" {
			t.Fatalf("Gemini API key must not be sent in URL query: %q", r.URL.RawQuery)
		}
		if r.URL.Query().Get("key") != "" {
			t.Fatal("Gemini API key must not be sent as a query parameter")
		}
		if got := r.Header.Get("x-goog-api-key"); got != "secret" {
			t.Fatalf("x-goog-api-key = %q, want %q", got, "secret")
		}
		if got := r.Header.Get("Authorization"); got != "" {
			t.Fatalf("Authorization header must not carry Gemini API key, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("gemini", server.URL, "secret", "gemini-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := client.do(context.Background(), "/v1beta/models/gemini-test:generateContent", map[string]any{"contents": []any{}})
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
}

func TestValidateUpstreamURLRejectsAmbiguousOrCredentialBearingURLs(t *testing.T) {
	tests := []struct {
		name string
		url  string
	}{
		{"userinfo", "https://user:password@1.1.1.1/v1"},
		{"query", "https://1.1.1.1/v1?target=https://169.254.169.254"},
		{"fragment", "https://1.1.1.1/v1#https://169.254.169.254"},
		{"scheme relative", "//1.1.1.1/v1"},
		{"missing host", "https:///v1"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := ValidateUpstreamURL(context.Background(), test.url, nil); err == nil {
				t.Fatalf("ValidateUpstreamURL(%q) unexpectedly succeeded", test.url)
			}
		})
	}
}

func TestAddressPolicyCoversIPv4AndIPv6ForbiddenRanges(t *testing.T) {
	alwaysForbidden := []string{
		"0.0.0.0",
		"169.254.169.254",
		"224.0.0.1",
		"::",
		"fe80::1",
		"ff02::1",
	}
	for _, raw := range alwaysForbidden {
		address := netip.MustParseAddr(raw)
		if err := validateAddresses([]netip.Addr{address}, true, false); err == nil {
			t.Fatalf("allowlisting must not permit forbidden address %s", raw)
		}
	}

	requiresAllowlist := []string{
		"10.0.0.8",
		"100.64.0.1",
		"127.0.0.1",
		"198.18.0.1",
		"192.0.0.8",
		"::1",
		"fd00::1",
		"2001:db8::1",
	}
	for _, raw := range requiresAllowlist {
		address := netip.MustParseAddr(raw)
		if err := validateAddresses([]netip.Addr{address}, false, false); err == nil {
			t.Fatalf("non-public address %s unexpectedly passed without allowlisting", raw)
		}
	}
}

func TestAddressPolicyFailsClosedForMixedDNSAnswers(t *testing.T) {
	public := netip.MustParseAddr("1.1.1.1")
	private := netip.MustParseAddr("10.0.0.8")
	linkLocal := netip.MustParseAddr("fe80::1")

	if err := validateAddresses([]netip.Addr{public, private}, false, true); err == nil {
		t.Fatal("mixed public/private DNS answers must fail closed")
	}
	if err := validateAddresses([]netip.Addr{public, linkLocal}, true, true); err == nil {
		t.Fatal("an explicitly allowed hostname must still reject forbidden DNS answers")
	}
}

func TestAddressPolicyHandlesIPv4MappedIPv6AsIPv4(t *testing.T) {
	mappedPrivate := netip.MustParseAddr("::ffff:10.0.0.8")
	if err := validateAddresses([]netip.Addr{mappedPrivate}, false, false); err == nil {
		t.Fatal("IPv4-mapped private IPv6 address must require allowlisting")
	}
	mappedMetadata := netip.MustParseAddr("::ffff:169.254.169.254")
	if err := validateAddresses([]netip.Addr{mappedMetadata}, true, false); err == nil {
		t.Fatal("IPv4-mapped metadata address must remain forbidden when allowlisted")
	}
}

func TestSafeTransportRevalidatesConnectionDestination(t *testing.T) {
	transport := safeTransport(nil, time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	if _, err := transport.DialContext(ctx, "tcp", "10.0.0.8:443"); err == nil || !strings.Contains(err.Error(), "allowlisting") {
		t.Fatalf("connection-time private address validation failed: %v", err)
	}
	if _, err := transport.DialContext(ctx, "tcp", "169.254.169.254:80"); err == nil || !strings.Contains(err.Error(), "forbidden") {
		t.Fatalf("connection-time metadata validation failed: %v", err)
	}
}

func TestSafeHTTPClientNeverFollowsRedirects(t *testing.T) {
	redirectTargetHit := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		redirectTargetHit = true
		w.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()

	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer origin.Close()

	client := NewSafeHTTPClient([]string{"127.0.0.1"}, time.Second)
	response, err := client.Get(origin.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusFound {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusFound)
	}
	if redirectTargetHit {
		t.Fatal("SSRF-hardened HTTP client followed an upstream redirect")
	}
}

func TestSyntheticDNSExceptionNeverAppliesToLiteralBenchmarkIP(t *testing.T) {
	benchmark := netip.MustParseAddr("198.18.0.77")
	if err := validateAddresses([]netip.Addr{benchmark}, false, true); err != nil {
		t.Fatalf("hostname Fake-IP path should accept benchmark result: %v", err)
	}
	if err := ValidateUpstreamURL(context.Background(), "https://198.18.0.77/v1", nil); err == nil {
		t.Fatal("literal benchmark-range Provider URL must not inherit hostname Fake-IP exception")
	}
}
