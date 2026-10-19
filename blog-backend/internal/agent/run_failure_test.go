package agent

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/provider"
)

func TestRunFailureDetailsRetainsTypedFinalProviderFailure(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadRequest)
		if calls == 1 {
			_, _ = io.WriteString(w, `{"error":{"message":"Stream must be set to true"}}`)
		} else {
			_, _ = io.WriteString(w, `{"error":{"message":"Invalid tool name","param":"tools[0].name"}}`)
		}
	}))
	defer server.Close()
	client, err := provider.NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", "responses", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
	if err == nil {
		t.Fatal("expected final Provider rejection")
	}
	code, message := runFailureDetails(err)
	if code != "provider_tool_name_invalid" || !strings.Contains(message, "Invalid tool name") || strings.Contains(message, "Stream must be set to true") {
		t.Fatalf("incorrect stored diagnostic: %q / %q", code, message)
	}
	if attempts != 1 || calls != 2 {
		t.Fatalf("unexpected retries: attempts=%d HTTP=%d", attempts, calls)
	}
}

func TestRunFailureDetailsKeepsNonProviderErrorsRedacted(t *testing.T) {
	code, message := runFailureDetails(errors.New("authorization: bearer secret"))
	if code != "agent_run_failed" || strings.Contains(message, "secret") {
		t.Fatalf("unsafe fallback: %q / %q", code, message)
	}
}
