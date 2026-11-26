package provider

import "testing"

func TestProviderResponseCompletionContracts(t *testing.T) {
	for _, tc := range []struct {
		name string
		validate func() error
		want error
	}{
		{"chat-stop", func() error { return validateOpenAIChatCompletion("stop", nil) }, nil},
		{"chat-tools", func() error { return validateOpenAIChatCompletion("tool_calls", []ToolCall{{ID:"1",Name:"read",Arguments:[]byte(`{}`)}}) }, nil},
		{"chat-length", func() error { return validateOpenAIChatCompletion("length", nil) }, ErrTextResponseIncomplete},
		{"chat-missing", func() error { return validateOpenAIChatCompletion("", nil) }, ErrTextResponseIncomplete},
		{"chat-content-filter", func() error { return validateOpenAIChatCompletion("content_filter", nil) }, ErrTextResponseRejected},
		{"responses-completed", func() error { return validateOpenAIResponsesCompletion("completed", nil) }, nil},
		{"responses-incomplete", func() error { return validateOpenAIResponsesCompletion("incomplete", nil) }, ErrTextResponseIncomplete},
		{"responses-failed", func() error { return validateOpenAIResponsesCompletion("failed", nil) }, ErrTextResponseRejected},
		{"anthropic-end", func() error { return validateAnthropicCompletion("end_turn", nil) }, nil},
		{"anthropic-tool", func() error { return validateAnthropicCompletion("tool_use", []ToolCall{{ID:"1",Name:"read",Arguments:[]byte(`{}`)}}) }, nil},
		{"anthropic-max-tokens", func() error { return validateAnthropicCompletion("max_tokens", nil) }, ErrTextResponseIncomplete},
		{"gemini-stop", func() error { return validateGeminiCompletion("STOP", nil) }, nil},
		{"gemini-max-tokens", func() error { return validateGeminiCompletion("MAX_TOKENS", nil) }, ErrTextResponseIncomplete},
		{"gemini-safety", func() error { return validateGeminiCompletion("SAFETY", nil) }, ErrTextResponseRejected},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.validate(); err != tc.want {
				t.Fatalf("error=%v want=%v", err, tc.want)
			}
		})
	}
}

func TestProviderResponseRejectsMalformedOrDuplicateToolCalls(t *testing.T) {
	for _, calls := range [][]ToolCall{
		{{ID:"",Name:"read",Arguments:[]byte(`{}`)}},
		{{ID:"1",Name:"",Arguments:[]byte(`{}`)}},
		{{ID:"1",Name:"read",Arguments:[]byte(`null`)}},
		{{ID:"1",Name:"read",Arguments:[]byte(`{"x":`)}},
		{{ID:"1",Name:"read",Arguments:[]byte(`{}`)},{ID:"1",Name:"write",Arguments:[]byte(`{}`)}},
	} {
		if err := validateResponseToolCalls(calls); err != ErrTextResponseInvalid {
			t.Fatalf("calls=%#v error=%v", calls, err)
		}
	}
}
