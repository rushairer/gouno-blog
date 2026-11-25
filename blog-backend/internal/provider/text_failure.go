package provider

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

var openAIToolNameParameter = regexp.MustCompile(`^tools\[[0-9]{1,6}\](\.function)?\.name$`)

// RetryableTextRejection permits a bounded Agent-level retry only for an
// actual HTTP 429 rejection. Transport/decode errors and HTTP 5xx can follow
// accepted, billed work; neither a timeout nor arbitrary response text proves
// that another generation is safe. Protocol/stream negotiation stays separate.
// This is not a billing guarantee, and must never be used for image requests.
func RetryableTextRejection(err error) bool {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var upstreamErr *upstreamHTTPError
	return errors.As(err, &upstreamErr) && upstreamErr.StatusCode == http.StatusTooManyRequests
}

func TextFailureCode(err error) string {
	switch {
	case errors.Is(err, ErrTextStreamIncomplete):
		return "provider_stream_incomplete"
	case errors.Is(err, ErrTextStreamInvalid):
		return "provider_stream_invalid"
	case errors.Is(err, ErrTextStreamRejected):
		return "provider_stream_failed"
	}
	if errors.Is(err, ErrTextDispatchStartUnconfirmed) {
		return "provider_dispatch_audit_start_unconfirmed"
	}
	if errors.Is(err, ErrTextDispatchFinishUnconfirmed) {
		return "provider_dispatch_audit_finish_unconfirmed"
	}
	var requestErr *openAITextRequestError
	hasOpenAIContext := errors.As(err, &requestErr)
	cause := err
	if hasOpenAIContext {
		if requestErr.disabled {
			return "provider_stream_disabled"
		}
		cause = requestErr.cause
	}
	var transportErr *upstreamTransportError
	hasProviderTransport := errors.As(cause, &transportErr)
	// Raw context errors may originate from database or local execution.
	// Do not label them as Provider failures without a typed Provider boundary.
	if hasOpenAIContext || hasProviderTransport {
		if errors.Is(cause, context.DeadlineExceeded) {
			return "provider_timeout"
		}
		if errors.Is(cause, context.Canceled) {
			return "provider_request_cancelled"
		}
	}
	var upstreamErr *upstreamHTTPError
	if !errors.As(cause, &upstreamErr) {
		if hasOpenAIContext || hasProviderTransport {
			return "provider_request_failed"
		}
		return ""
	}
	if hasOpenAIContext && requestErr.stream && requiresStreamingFallback(cause) {
		return "provider_stream_rejected"
	}
	switch upstreamErr.StatusCode {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		var decoded struct {
			Error struct {
				Param string `json:"param"`
			} `json:"error"`
		}
		if (hasOpenAIContext || upstreamErr.Provider == "openai") &&
			json.Unmarshal([]byte(upstreamErr.Body), &decoded) == nil && openAIToolNameParameter.MatchString(decoded.Error.Param) {
			return "provider_tool_name_invalid"
		}
		return "provider_request_invalid"
	case http.StatusUnauthorized, http.StatusForbidden:
		return "provider_auth_rejected"
	case http.StatusNotFound, http.StatusMethodNotAllowed:
		return "provider_endpoint_unavailable"
	case http.StatusTooManyRequests:
		return "provider_rate_limited"
	default:
		if upstreamErr.StatusCode >= 500 {
			return "provider_unavailable"
		}
		return "provider_request_failed"
	}
}

func TextFailureMessage(code string) string {
	switch code {
	case "provider_stream_incomplete":
		return "Provider stream ended without confirmed model completion; no Tool output was accepted."
	case "provider_stream_invalid":
		return "Provider stream contained invalid data or Tool calls; no Tool output was accepted."
	case "provider_stream_failed":
		return "Provider stream reported a failed response; inspect the invocation evidence before retrying."
	case "provider_dispatch_audit_start_unconfirmed":
		return "Provider dispatch audit was not acknowledged; the associated HTTP call was not sent."
	case "provider_dispatch_audit_finish_unconfirmed":
		return "Provider response evidence was not acknowledged; inspect the recorded dispatch before any retry."
	case "provider_stream_disabled":
		return "Provider requires streaming, but stream_mode=never disables it."
	case "provider_stream_rejected":
		return "Provider rejected a request that already sent stream=true; check gateway forwarding and protocol compatibility."
	case "provider_tool_name_invalid":
		return "Provider rejected a tool name (tools[].name); tool names must use letters, digits, underscores or hyphens."
	case "provider_request_invalid":
		return "Provider rejected the request parameters (HTTP 400/422); inspect the Agent run's error details."
	case "provider_auth_rejected":
		return "Provider rejected authentication or access (HTTP 401/403)."
	case "provider_endpoint_unavailable":
		return "Provider endpoint was not found or does not support the request method (HTTP 404/405)."
	case "provider_rate_limited":
		return "Provider rejected the request with HTTP 429; check rate limits and quota."
	case "provider_unavailable":
		return "Provider returned a server error (HTTP 5xx); inspect the Agent run's error details."
	case "provider_timeout":
		return "Provider request timed out."
	case "provider_request_cancelled":
		return "Provider request was cancelled."
	case "provider_request_failed":
		return "Provider request failed; inspect the Agent run's error details."
	default:
		return ""
	}
}
