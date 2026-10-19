package provider

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

var openAIToolNameParameter = regexp.MustCompile(`^tools\[[0-9]{1,6}\](\.function)?\.name$`)

func TextFailureCode(err error) string {
	var requestErr *openAITextRequestError
	if !errors.As(err, &requestErr) {
		return ""
	}
	if requestErr.disabled {
		return "provider_stream_disabled"
	}
	if errors.Is(requestErr.cause, context.DeadlineExceeded) {
		return "provider_timeout"
	}
	if errors.Is(requestErr.cause, context.Canceled) {
		return "provider_request_cancelled"
	}
	var upstreamErr *upstreamHTTPError
	if !errors.As(requestErr.cause, &upstreamErr) {
		return "provider_request_failed"
	}
	if requestErr.stream && requiresStreamingFallback(requestErr.cause) {
		return "provider_stream_rejected"
	}
	switch upstreamErr.StatusCode {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		var decoded struct {
			Error struct {
				Param string `json:"param"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(upstreamErr.Body), &decoded) == nil && openAIToolNameParameter.MatchString(decoded.Error.Param) {
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
