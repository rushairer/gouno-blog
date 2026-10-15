package provider

import (
	"context"
	"errors"
	"fmt"
	"net/http"
)

// openAITextRequestError describes the request that actually failed. Keep only
// its cause in the error chain: retaining an earlier negotiation error can make
// errors.As, retry classification and request evidence select the wrong attempt.
// Endpoint is a constant API path, never a configured upstream URL or prompt.
type openAITextRequestError struct {
	endpoint   string
	stream     bool
	negotiated bool
	disabled   bool
	cause      error
}

func (e *openAITextRequestError) Error() string {
	if e.disabled {
		return fmt.Sprintf("openai %s requires stream=true, but stream_mode=never disables streaming", e.endpoint)
	}
	if e.negotiated {
		return fmt.Sprintf("openai %s streaming fallback (stream=true) failed: %v", e.endpoint, e.cause)
	}
	return fmt.Sprintf("openai %s request (stream=%t) failed: %v", e.endpoint, e.stream, e.cause)
}

func (e *openAITextRequestError) Unwrap() error { return e.cause }

// openAITextRequest negotiates streaming at most once on the same text endpoint.
// This helper must not be used for billable image-generation fallback/replay.
func (p *HTTPProvider) openAITextRequest(ctx context.Context, endpoint string, body map[string]any) (*http.Response, bool, error) {
	stream := p.streamMode == "always"
	if p.streamMode == "always" || p.streamMode == "never" {
		body["stream"] = stream
	}
	send := func() (*http.Response, error) {
		var headers map[string]string
		if stream {
			headers = map[string]string{"Accept": "text/event-stream"}
		}
		return p.doWithHeaders(ctx, endpoint, body, headers)
	}
	resp, err := send()
	if err == nil {
		return resp, stream, nil
	}
	failure := &openAITextRequestError{endpoint: endpoint, stream: stream, cause: err}
	if ctx.Err() != nil || !requiresStreamingFallback(err) {
		return nil, stream, failure
	}
	if p.streamMode == "never" {
		failure.disabled = true
		return nil, false, failure
	}
	if stream {
		// Already sent true. A gateway that still rejects it needs diagnosis,
		// not another identical request or an automatic protocol switch.
		return nil, true, failure
	}

	stream = true
	body["stream"] = true
	resp, err = send()
	if err != nil {
		return nil, true, &openAITextRequestError{
			endpoint: endpoint, stream: true, negotiated: true, cause: err,
		}
	}
	return resp, true, nil
}

// Only a direct 404/405 from the initial endpoint permits legacy text-protocol
// discovery. Once the endpoint requires streaming, a subsequent failure belongs
// to that selected endpoint. Authentication, quota, transport and decode errors
// are not signals to send the request again through another protocol.
func shouldFallbackOpenAITextProtocol(err error) bool {
	var requestErr *openAITextRequestError
	if !errors.As(err, &requestErr) || requestErr.negotiated || requestErr.disabled {
		return false
	}
	var upstreamErr *upstreamHTTPError
	return errors.As(requestErr.cause, &upstreamErr) &&
		(upstreamErr.StatusCode == http.StatusNotFound || upstreamErr.StatusCode == http.StatusMethodNotAllowed)
}
