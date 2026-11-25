
package provider

import (
	"encoding/json"
	"strings"
)

var (
	ErrTextResponseIncomplete = errors.New("provider text response is incomplete")
	ErrTextResponseInvalid    = errors.New("provider text response is invalid")
	ErrTextResponseRejected   = errors.New("provider text response was rejected")
)

func validateResponseToolCalls(calls []ToolCall) error {
	seen := make(map[string]struct{}, len(calls))
	for _, call := range calls {
		if strings.TrimSpace(call.ID) == "" || strings.TrimSpace(call.Name) == "" {
			return ErrTextResponseInvalid
		}
		var object map[string]json.RawMessage
		if json.Unmarshal(call.Arguments, &object) != nil || object == nil {
			return ErrTextResponseInvalid
		}
		if _, exists := seen[call.ID]; exists {
			return ErrTextResponseInvalid
		}
		seen[call.ID] = struct{}{}
	}
	return nil
}

func validateOpenAIChatCompletion(reason string, calls []ToolCall) error {
	switch reason {
	case "stop":
		if len(calls) != 0 {
			return ErrTextResponseInvalid
		}
		return nil
	case "tool_calls":
		if len(calls) == 0 {
			return ErrTextResponseInvalid
		}
		return validateResponseToolCalls(calls)
	case "length", "":
		return ErrTextResponseIncomplete
	case "content_filter":
		return ErrTextResponseRejected
	default:
		return ErrTextResponseInvalid
	}
}

func validateOpenAIResponsesCompletion(status string, calls []ToolCall) error {
	switch status {
	case "completed":
		return validateResponseToolCalls(calls)
	case "incomplete", "in_progress", "":
		return ErrTextResponseIncomplete
	case "failed", "cancelled":
		return ErrTextResponseRejected
	default:
		return ErrTextResponseInvalid
	}
}

func validateAnthropicCompletion(reason string, calls []ToolCall) error {
	switch reason {
	case "end_turn", "stop_sequence", "refusal":
		if len(calls) != 0 {
			return ErrTextResponseInvalid
		}
		return nil
	case "tool_use":
		if len(calls) == 0 {
			return ErrTextResponseInvalid
		}
		return validateResponseToolCalls(calls)
	case "max_tokens", "pause_turn", "":
		return ErrTextResponseIncomplete
	default:
		return ErrTextResponseInvalid
	}
}

func validateGeminiCompletion(reason string, calls []ToolCall) error {
	switch reason {
	case "STOP":
		return validateResponseToolCalls(calls)
	case "MAX_TOKENS", "":
		return ErrTextResponseIncomplete
	case "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII",
		"MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY", "UNEXPECTED_TOOL_CALL":
		return ErrTextResponseRejected
	default:
		return ErrTextResponseInvalid
	}
}
