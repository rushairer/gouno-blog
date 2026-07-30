package agent

import (
	"encoding/json"
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
