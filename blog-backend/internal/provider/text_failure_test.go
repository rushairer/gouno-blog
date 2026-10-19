package provider

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestTextFailureCodeUsesFinalTypedCause(t *testing.T) {
	for _, test := range []struct {
		name string
		err  error
		code string
	}{
		{"tool_name", &upstreamHTTPError{StatusCode: 400, Body: `{"error":{"param":"tools[0].name","message":"secret prompt"}}`}, "provider_tool_name_invalid"},
		{"chat_tool_name", &upstreamHTTPError{StatusCode: 422, Body: `{"error":{"param":"tools[12].function.name"}}`}, "provider_tool_name_invalid"},
		{"other_parameter", &upstreamHTTPError{StatusCode: 400, Body: `{"error":{"param":"tools[0].parameters"}}`}, "provider_request_invalid"},
		{"untrusted_parameter", &upstreamHTTPError{StatusCode: 400, Body: `{"error":{"param":"tools[0].name; bearer secret"}}`}, "provider_request_invalid"},
		{"malformed_body", &upstreamHTTPError{StatusCode: 400, Body: `private gateway URL`}, "provider_request_invalid"},
		{"auth", &upstreamHTTPError{StatusCode: 401}, "provider_auth_rejected"},
		{"access", &upstreamHTTPError{StatusCode: 403}, "provider_auth_rejected"},
		{"endpoint", &upstreamHTTPError{StatusCode: 404}, "provider_endpoint_unavailable"},
		{"method", &upstreamHTTPError{StatusCode: 405}, "provider_endpoint_unavailable"},
		{"quota", &upstreamHTTPError{StatusCode: 429}, "provider_rate_limited"},
		{"upstream", &upstreamHTTPError{StatusCode: 502}, "provider_unavailable"},
		{"timeout", context.DeadlineExceeded, "provider_timeout"},
		{"cancelled", context.Canceled, "provider_request_cancelled"},
		{"transport", errors.New("https://private.example/?api_key=secret"), "provider_request_failed"},
	} {
		t.Run(test.name, func(t *testing.T) {
			requestErr := &openAITextRequestError{endpoint: "/v1/responses", stream: true, negotiated: true, cause: test.err}
			err := fmt.Errorf("provider request failed after 1 attempt: %w", requestErr)
			if code := TextFailureCode(err); code != test.code {
				t.Fatalf("code = %q, want %q", code, test.code)
			}
			message := TextFailureMessage(test.code)
			if message == "" || strings.Contains(message, "secret") || strings.Contains(message, "private.example") || strings.Contains(message, "Stream must be set to true") {
				t.Fatalf("unsafe or obsolete summary: %q", message)
			}
			if !errors.Is(err, test.err) {
				t.Fatal("final cause lost")
			}
		})
	}
}

func TestTextFailureCodeDistinguishesStreamConflicts(t *testing.T) {
	cause := &upstreamHTTPError{StatusCode: http.StatusBadRequest, Body: requiredStreamErrorJSON}
	for _, test := range []struct {
		err  *openAITextRequestError
		code string
	}{
		{&openAITextRequestError{disabled: true, cause: cause}, "provider_stream_disabled"},
		{&openAITextRequestError{stream: true, cause: cause}, "provider_stream_rejected"},
	} {
		if code := TextFailureCode(test.err); code != test.code {
			t.Fatalf("code = %q, want %q", code, test.code)
		}
	}
	if code := TextFailureCode(errors.New("Stream must be set to true")); code != "" {
		t.Fatalf("untyped text must not be classified: %q", code)
	}
	if TextFailureMessage("unknown secret") != "" {
		t.Fatal("unknown diagnostic codes must not be reflected")
	}
}

func TestTextFailurePlacesActualCauseBeforeNegotiationContext(t *testing.T) {
	cause := &upstreamHTTPError{Provider: "openai", StatusCode: 400, Body: `{"error":{"param":"tools[0].name","message":"Invalid tool name"}}`}
	err := &openAITextRequestError{endpoint: "/v1/responses", stream: true, negotiated: true, cause: cause}
	message := err.Error()
	if strings.Index(message, "Invalid tool name") > strings.Index(message, "stream=true") || strings.Contains(message, "streaming fallback") {
		t.Fatalf("negotiation must not obscure the actual cause: %s", message)
	}
}
