package agent

import (
	"encoding/json"
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
