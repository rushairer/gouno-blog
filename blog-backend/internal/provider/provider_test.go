package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOpenAIGenerateParsesToolCallWithoutLeakingKey(t *testing.T) {
	var authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status":"completed",
			"output":[{"type":"function_call","call_id":"call_1","name":"content.list_posts","arguments":"{\"limit\":5}"}],
			"usage":{"input_tokens":12,"output_tokens":7}
		}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("openai", server.URL, "top-secret", "gpt-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Instructions: "test",
		Messages:     []Message{{Role: "user", Content: "list posts"}},
		Tools: []ToolDefinition{{
			Name: "content.list_posts", Description: "list",
			Parameters: json.RawMessage(`{"type":"object","properties":{"limit":{"type":"integer"}}}`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if authorization != "Bearer top-secret" {
		t.Fatalf("authorization = %q", authorization)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" ||
		string(result.ToolCalls[0].Arguments) != `{"limit":5}` {
		t.Fatalf("tool calls = %#v", result.ToolCalls)
	}
	if result.InputTokens != 12 || result.OutputTokens != 7 {
		t.Fatalf("usage = %d/%d", result.InputTokens, result.OutputTokens)
	}
}

func TestAnthropicGenerateParsesTextAndToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "secret" {
			t.Fatal("missing Anthropic key")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"content":[
				{"type":"text","text":"Checking."},
				{"type":"tool_use","id":"tool_1","name":"analytics.get_summary","input":{"days":7}}
			],
			"stop_reason":"tool_use",
			"usage":{"input_tokens":8,"output_tokens":4}
		}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "claude-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Messages: []Message{{Role: "user", Content: "report"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "Checking." || len(result.ToolCalls) != 1 ||
		string(result.ToolCalls[0].Arguments) != `{"days":7}` {
		t.Fatalf("result = %#v", result)
	}
}

func TestProviderRejectsUnsafeOrUnlistedUpstream(t *testing.T) {
	tests := []struct {
		url, host string
	}{
		{"http://example.com", "example.com"},
		{"https://169.254.169.254", "169.254.169.254"},
		{"https://api.openai.com", "api.anthropic.com"},
	}
	for _, tc := range tests {
		_, err := NewHTTPProvider("openai", tc.url, "secret", "model", []string{tc.host}, time.Second)
		if err == nil {
			t.Fatalf("expected %s to be rejected", tc.url)
		}
	}
}

func TestUpstreamErrorBodyIsBounded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, strings.Repeat("x", 10000), http.StatusBadGateway)
	}))
	defer server.Close()
	client, _ := NewHTTPProvider("openai", server.URL, "secret", "model", []string{"127.0.0.1"}, time.Second)
	_, err := client.Generate(context.Background(), Request{Messages: []Message{{Role: "user", Content: "x"}}})
	if err == nil || len(err.Error()) > 2200 {
		t.Fatalf("unexpected error length: %v", err)
	}
}
