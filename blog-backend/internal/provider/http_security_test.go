package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
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
