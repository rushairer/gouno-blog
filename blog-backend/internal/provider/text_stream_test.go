package provider

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTextStreamRejectsIncompleteInvalidAndFailedResponses(t *testing.T) {
	for _, tc := range []struct {
		name, protocol, stream string
		want error
		input, output int64
	}{
		{"chat-eof", "chat_completions", "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}\n\n", ErrTextStreamIncomplete, 7, 2},
		{"chat-done-without-finish", "chat_completions", "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\ndata: [DONE]\n\n", ErrTextStreamIncomplete, 0, 0},
		{"chat-malformed", "chat_completions", "data: {\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}\n\ndata: {invalid}\n\ndata: {\"choices\":[{\"finish_reason\":\"stop\"}]}\n\n", ErrTextStreamInvalid, 7, 2},
		{"chat-length", "chat_completions", "data: {\"choices\":[{\"finish_reason\":\"length\"}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}\n\n", ErrTextStreamIncomplete, 7, 2},
		{"chat-missing-arguments", "chat_completions", "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"read\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n", ErrTextStreamInvalid, 0, 0},
		{"chat-http-200-error", "chat_completions", "data: {\"error\":{\"message\":\"private body returned 429\"}}\n\n", ErrTextStreamRejected, 0, 0},
		{"responses-eof", "responses", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n", ErrTextStreamIncomplete, 0, 0},
		{"responses-unframed", "responses", "data: {\"type\":\"response.completed\"}", ErrTextStreamIncomplete, 0, 0},
		{"responses-failed", "responses", "data: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"usage\":{\"input_tokens\":7,\"output_tokens\":2}}}\n\n", ErrTextStreamRejected, 7, 2},
		{"responses-incomplete", "responses", "data: {\"type\":\"response.incomplete\",\"response\":{\"status\":\"incomplete\",\"usage\":{\"input_tokens\":7,\"output_tokens\":2}}}\n\n", ErrTextStreamIncomplete, 7, 2},
		{"responses-inconsistent", "responses", "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"in_progress\"}}\n\n", ErrTextStreamInvalid, 0, 0},
		{"responses-delta-after-terminal", "responses", "data: {\"type\":\"response.completed\"}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"unexpected\"}\n\n", ErrTextStreamInvalid, 0, 0},
		{"responses-incomplete-tool", "responses", "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"function_call\",\"id\":\"item_1\",\"call_id\":\"call_1\",\"name\":\"write\"}}\n\ndata: {\"type\":\"response.completed\"}\n\n", ErrTextStreamInvalid, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				requests.Add(1)
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("x-request-id", "fixture-stream")
				_, _ = io.WriteString(w, tc.stream)
			}))
			defer server.Close()
			client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", tc.protocol, "always", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			result, err := client.Generate(context.Background(), Request{})
			if !errors.Is(err, tc.want) || requests.Load() != 1 || RetryableTextRejection(err) ||
				result.Text != "" || len(result.ToolCalls) != 0 || result.InputTokens != tc.input ||
				result.OutputTokens != tc.output || result.Evidence.RequestID != "fixture-stream" ||
				strings.Contains(err.Error(), "private body") {
				t.Fatalf("unsafe or missing stream evidence: requests=%d result=%#v err=%v", requests.Load(), result, err)
			}
		})
	}
}

func TestResponsesTextStreamIgnoresNonFunctionItemsAndHandlesMultilineSSE(t *testing.T) {
	body := "event: response.output_item.added\n"+
		"data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"reasoning\",\"id\":\"reasoning_1\"}}\n\n"+
		"data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"message\",\"id\":\"message_1\"}}\n\n"+
		"data: {\"type\":\"response.output_text.delta\",\n"+
		"data: \"delta\":\"answer\"}\n\n"+
		"data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"message\",\"id\":\"message_1\"}}\n\n"+
		"data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":4,\"output_tokens\":2}}}\n\n"
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}
	result, err := decodeOpenAIResponsesStream(resp)
	if err != nil || result.Text != "answer" || len(result.ToolCalls) != 0 || result.StopReason != "completed" ||
		result.InputTokens != 4 || result.OutputTokens != 2 {
		t.Fatalf("valid stream was misdecoded: result=%#v err=%v", result, err)
	}
}

func TestChatTextStreamAcceptsExplicitFinishWithoutDoneAndTrailingUsage(t *testing.T) {
	body := "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"},\"finish_reason\":\"stop\"}]}\n\n"+
		"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}}\n\n"
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}
	result, err := decodeOpenAIChatStream(resp)
	if err != nil || result.Text != "answer" || result.StopReason != "stop" ||
		result.InputTokens != 5 || result.OutputTokens != 2 {
		t.Fatalf("valid compatible stream rejected: result=%#v err=%v", result, err)
	}
}
