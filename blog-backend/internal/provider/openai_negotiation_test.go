package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const requiredStreamErrorJSON = `{"error":{"message":"Stream must be set to true","type":"bad_response_status_code","param":"","code":"bad_response_status_code"}}`

func TestOpenAITextNegotiationPreservesStreamingFailure(t *testing.T) {
	for _, protocol := range []string{"responses", "chat_completions", "", "auto"} {
		for _, status := range []int{400, 401, 403, 404, 405, 429, 500, 502} {
			t.Run(fmt.Sprintf("%s/%d", protocol, status), func(t *testing.T) {
				var calls atomic.Int32
				path := "/v1/responses"
				if protocol == "chat_completions" {
					path = "/v1/chat/completions"
				}
				finalBody := `{"error":{"message":"actual streaming request failure"}}`
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					n := calls.Add(1)
					if r.URL.Path != path {
						t.Errorf("unexpected protocol replay: %s", r.URL.Path)
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					if n == 1 {
						w.Header().Set("x-request-id", "nonstream-request")
						w.WriteHeader(http.StatusBadRequest)
						_, _ = io.WriteString(w, requiredStreamErrorJSON)
						return
					}
					if body["stream"] != true {
						t.Errorf("fallback must send stream=true: %#v", body)
					}
					w.Header().Set("x-request-id", "stream-request")
					w.WriteHeader(status)
					_, _ = io.WriteString(w, finalBody)
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("openai", server.URL, "test-key", "test-model", protocol, "auto", []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				_, err = client.Generate(context.Background(), Request{Messages: []Message{{Role: "user", Content: "test"}}})
				var upstream *upstreamHTTPError
				if !errors.As(err, &upstream) || upstream.StatusCode != status || upstream.Body != finalBody {
					t.Errorf("must retain the final HTTP failure, got %v", err)
				}
				if got := RequestEvidenceFromError(err).RequestID; got != "stream-request" {
					t.Errorf("request evidence = %q, want stream-request", got)
				}
				if calls.Load() != 2 {
					t.Errorf("HTTP calls = %d, want exactly 2", calls.Load())
				}
			})
		}
	}
}

func TestOpenAITextNegotiationOnlySwitchesUnavailableEndpoints(t *testing.T) {
	for _, status := range []int{400, 401, 403, 404, 405, 429, 500, 502} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path == "/v1/responses" {
					w.WriteHeader(status)
					_, _ = io.WriteString(w, `{"error":{"message":"primary endpoint failure"}}`)
					return
				}
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = io.WriteString(w, `{"error":{"message":"chat authentication failure"}}`)
			}))
			defer server.Close()
			client, err := NewHTTPProvider("openai", server.URL, "test-key", "test-model", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.Generate(context.Background(), Request{})
			wantCalls, wantStatus := int32(1), status
			if status == http.StatusNotFound || status == http.StatusMethodNotAllowed {
				wantCalls, wantStatus = 2, http.StatusUnauthorized
			}
			var upstream *upstreamHTTPError
			if !errors.As(err, &upstream) || upstream.StatusCode != wantStatus {
				t.Errorf("last error = %v, want status %d", err, wantStatus)
			}
			if got := calls.Load(); got != wantCalls {
				t.Errorf("calls = %d, want %d", got, wantCalls)
			}
		})
	}
}

type negotiationRoundTripFunc func(*http.Request) (*http.Response, error)

func (f negotiationRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestOpenAITextNegotiationPreservesTransportCause(t *testing.T) {
	for _, cause := range []error{context.Canceled, context.DeadlineExceeded, io.ErrUnexpectedEOF} {
		t.Run(cause.Error(), func(t *testing.T) {
			calls := 0
			client := &HTTPProvider{name: "openai", baseURL: "https://provider.invalid", model: "test-model", streamMode: "auto"}
			client.client = &http.Client{Transport: negotiationRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				if calls == 1 {
					return &http.Response{StatusCode: 400, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(requiredStreamErrorJSON)), Request: r}, nil
				}
				return nil, cause
			})}
			_, err := client.Generate(context.Background(), Request{})
			if !errors.Is(err, cause) || calls != 2 {
				t.Fatalf("cause lost or request replayed: calls=%d err=%v", calls, err)
			}
		})
	}
}

func TestOpenAITextNegotiationRespectsExplicitStreamModes(t *testing.T) {
	for _, protocol := range []string{"responses", "chat_completions"} {
		for _, mode := range []string{"never", "always"} {
			t.Run(protocol+"/"+mode, func(t *testing.T) {
				var calls atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					if body["stream"] != (mode == "always") {
						t.Errorf("explicit %s must serialize its boolean: %#v", mode, body)
					}
					w.WriteHeader(http.StatusBadRequest)
					_, _ = io.WriteString(w, requiredStreamErrorJSON)
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("openai", server.URL, "test-key", "test-model", protocol, mode, []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				_, err = client.Generate(context.Background(), Request{})
				if err == nil || calls.Load() != 1 {
					t.Fatalf("mode=%s calls=%d err=%v", mode, calls.Load(), err)
				}
				if mode == "never" && !strings.Contains(err.Error(), "stream_mode=never") {
					t.Errorf("missing actionable configuration conflict: %v", err)
				}
				if mode == "always" && !strings.Contains(err.Error(), "stream=true") {
					t.Errorf("error must show streaming was already requested: %v", err)
				}
			})
		}
	}
}

func TestOpenAITextNegotiationStopsAfterRepeatedRequirement(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, requiredStreamErrorJSON)
	}))
	defer server.Close()
	client, err := NewHTTPProvider("openai", server.URL, "test-key", "test-model", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Generate(context.Background(), Request{})
	if err == nil || !strings.Contains(err.Error(), "stream=true") || calls.Load() != 2 {
		t.Fatalf("must identify failed stream=true request without replay: calls=%d err=%v", calls.Load(), err)
	}
}
