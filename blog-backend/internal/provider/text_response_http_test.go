package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestGovernedNonStreamResponseCompletionHTTP(t *testing.T) {
	for _, tc := range []struct {
		name, vendor, protocol, body, outcome string
		wantErr error
		wantCalls int
	}{
		{"chat-complete", "openai", "chat_completions", `{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}`, "decoded", nil, 0},
		{"chat-tool", "openai", "chat_completions", `{"choices":[{"message":{"tool_calls":[{"id":"c1","type":"function","function":{"name":"read","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}`, "decoded", nil, 1},
		{"chat-length", "openai", "chat_completions", `{"choices":[{"message":{"content":"partial","tool_calls":[{"id":"c1","type":"function","function":{"name":"read","arguments":"{}"}}]},"finish_reason":"length"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}`, "incomplete", ErrTextResponseIncomplete, 0},
		{"chat-missing", "openai", "chat_completions", `{"choices":[{"message":{"content":"partial"}}],"usage":{"prompt_tokens":4,"completion_tokens":2}}`, "incomplete", ErrTextResponseIncomplete, 0},
		{"chat-conflict", "openai", "chat_completions", `{"choices":[{"message":{"tool_calls":[{"id":"c1","type":"function","function":{"name":"read","arguments":"{}"}}]},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}`, "invalid", ErrTextResponseInvalid, 0},
		{"responses-complete", "openai", "responses", `{"status":"completed","output_text":"ok","usage":{"input_tokens":4,"output_tokens":2}}`, "decoded", nil, 0},
		{"responses-incomplete", "openai", "responses", `{"status":"incomplete","output_text":"partial","output":[{"type":"function_call","call_id":"c1","name":"read","arguments":"{}"}],"usage":{"input_tokens":4,"output_tokens":2}}`, "incomplete", ErrTextResponseIncomplete, 0},
		{"responses-incomplete-item", "openai", "responses", `{"status":"completed","output":[{"type":"function_call","status":"in_progress","call_id":"c1","name":"read","arguments":"{}"}],"usage":{"input_tokens":4,"output_tokens":2}}`, "invalid", ErrTextResponseInvalid, 0},
		{"responses-duplicate", "openai", "responses", `{"status":"completed","output":[{"type":"function_call","call_id":"c1","name":"read","arguments":"{}"},{"type":"function_call","call_id":"c1","name":"read","arguments":"{}"}],"usage":{"input_tokens":4,"output_tokens":2}}`, "invalid", ErrTextResponseInvalid, 0},
		{"anthropic-complete", "anthropic", "", `{"stop_reason":"end_turn","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":4,"output_tokens":2}}`, "decoded", nil, 0},
		{"anthropic-tool", "anthropic", "", `{"stop_reason":"tool_use","content":[{"type":"tool_use","id":"c1","name":"read","input":{}}],"usage":{"input_tokens":4,"output_tokens":2}}`, "decoded", nil, 1},
		{"anthropic-truncated", "anthropic", "", `{"stop_reason":"max_tokens","content":[{"type":"tool_use","id":"c1","name":"read","input":{}}],"usage":{"input_tokens":4,"output_tokens":2}}`, "incomplete", ErrTextResponseIncomplete, 0},
		{"anthropic-refusal", "anthropic", "", `{"stop_reason":"refusal","content":[{"type":"text","text":"partial"}],"usage":{"input_tokens":4,"output_tokens":2}}`, "rejected", ErrTextResponseRejected, 0},
		{"gemini-complete", "gemini", "", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"ok"}]}}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}`, "decoded", nil, 0},
		{"gemini-tool", "gemini", "", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"functionCall":{"name":"read","args":{}}}]}}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}`, "decoded", nil, 1},
		{"gemini-truncated", "gemini", "", `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"functionCall":{"name":"read","args":{}}}]}}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}`, "incomplete", ErrTextResponseIncomplete, 0},
		{"gemini-blocked", "gemini", "", `{"promptFeedback":{"blockReason":"SAFETY"},"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}`, "rejected", ErrTextResponseRejected, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				requests.Add(1)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client, err := NewHTTPProviderWithConfig(tc.vendor, server.URL, "fixture-key", "model", tc.protocol, "never", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			audit := &recordingTextDispatchAudit{}
			result, err := client.Generate(context.Background(), Request{DispatchAudit: audit})
			if !errors.Is(err, tc.wantErr) || requests.Load() != 1 || len(audit.starts) != 1 ||
				len(audit.outcomes) != 1 || len(audit.completions) != 1 {
				t.Fatalf("requests=%d audit=%#v err=%v", requests.Load(), audit, err)
			}
			if audit.outcomes[0].Status != "response_received" || audit.completions[0].Status != tc.outcome ||
				result.InputTokens != 4 || result.OutputTokens != 2 || len(result.ToolCalls) != tc.wantCalls {
				t.Fatalf("result=%#v audit=%#v", result, audit)
			}
			if tc.wantErr != nil && (result.Text != "" || result.StopReason != "" || RetryableTextRejection(err)) {
				t.Fatalf("rejected result leaked output or permitted replay: %#v", result)
			}
		})
	}
}
