package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/provider"
)

func TestApproximateInputBytesIncludesToolContext(t *testing.T) {
	messages := []provider.Message{
		{Role: "user", Content: "request"},
		{Role: "assistant", Content: "result", ToolCalls: []provider.ToolCall{
			{ID: "call-1", Name: "content.get_post", Arguments: json.RawMessage(`{"id":1}`)},
		}},
		{Role: "tool", ToolCallID: "call-1", Content: `{"content":"post"}`},
	}
	got := approximateInputBytes("instructions", messages)
	if got <= len("instructionsrequestresult") {
		t.Fatalf("expected tool context to be counted, got %d", got)
	}
}

func TestCollectRSSSourceLinksDeduplicatesAndRejectsUnsafeURLs(t *testing.T) {
	links := collectRSSSourceLinks(nil, json.RawMessage(`{"items":[
		{"title":"OpenAI","url":"https://openai.com/news/example"},
		{"title":"duplicate","url":"https://openai.com/news/example"},
		{"title":"unsafe","url":"http://example.com/news"}
	]}`))
	if len(links) != 1 || links[0].Title != "OpenAI" || links[0].URL != "https://openai.com/news/example" {
		t.Fatalf("unexpected source links: %#v", links)
	}
}

func TestAppendRSSSourceLinksKeepsExistingLinksAndAddsOriginalSection(t *testing.T) {
	arguments := json.RawMessage(`{"title":"AI news","content":"News summary without any links","tags":[]}`)
	updated, err := appendRSSSourceLinks(arguments, []rssSourceLink{
		{Title: "OpenAI", URL: "https://openai.com/news/example"},
		{Title: "Google Blog", URL: "https://blog.google/example"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload createPostArguments
	if err := json.Unmarshal(updated, &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(payload.Content, "## 原文链接") || !strings.Contains(payload.Content, "[Google Blog](<https://blog.google/example>)") {
		t.Fatalf("source section is missing: %s", payload.Content)
	}
}

func TestAppendRSSSourceLinksDoesNotAppendWhenContentAlreadyHasInlineLinks(t *testing.T) {
	arguments := json.RawMessage(`{"title":"AI news","content":"Already covered: [OpenAI](https://openai.com/news/example)","tags":[]}`)
	updated, err := appendRSSSourceLinks(arguments, []rssSourceLink{
		{Title: "OpenAI", URL: "https://openai.com/news/example"},
		{Title: "Google Blog", URL: "https://blog.google/example"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload createPostArguments
	if err := json.Unmarshal(updated, &payload); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(payload.Content, "## 原文链接") {
		t.Fatalf("should not append source links when content already has inline links: %s", payload.Content)
	}
}


type retryTestProvider struct {
	calls int
	err   error
}

func (p *retryTestProvider) Name() string  { return "retry-test" }
func (p *retryTestProvider) Model() string { return "test-model" }

func (p *retryTestProvider) Generate(context.Context, provider.Request) (provider.Result, error) {
	p.calls++
	return provider.Result{}, p.err
}

func TestGenerateWithRetryReportsActualAttemptsForNonRetryableError(t *testing.T) {
	client := &retryTestProvider{
		err: errors.New(`upstream openai returned 400: {"error":{"message":"Stream must be set to true"}}`),
	}
	_, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
	if err == nil {
		t.Fatal("expected provider error")
	}
	if attempts != 1 || client.calls != 1 {
		t.Fatalf("attempts=%d calls=%d, want 1/1", attempts, client.calls)
	}
	if !strings.Contains(err.Error(), "provider request failed after 1 attempt:") {
		t.Fatalf("unexpected error: %v", err)
	}
}
