package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Count requests at a real HTTP server, not just service-to-adapter calls.
// None of these outcomes authorizes another billable generation endpoint.
func TestImageHTTPFailuresNeverFallbackOrReplay(t *testing.T) {
	for _, mode := range []string{"", "auto", "responses", "chat_completions"} {
		for _, outcome := range []string{
			"http_400", "http_404", "http_422", "http_429", "http_500", "http_503",
			"disconnect", "deadline", "cancel_after_accept", "truncated_stream",
			"truncated_json", "invalid_image", "missing_image", "redirect",
		} {
			t.Run(mode+"/"+outcome, func(t *testing.T) {
				var requests atomic.Int32
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				expectedPath := "/v1/responses"
				if mode == "chat_completions" {
					expectedPath = "/v1/chat/completions"
				}
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					if r.Method != http.MethodPost || r.URL.Path != expectedPath {
						t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					}
					if r.Header.Get("Idempotency-Key") != "" || r.Header.Get("X-Idempotency-Key") != "" {
						t.Error("unverified idempotency header added")
					}
					_, _ = io.Copy(io.Discard, r.Body)
					_ = r.Body.Close()
					if strings.HasPrefix(outcome, "http_") {
						var status int
						_, _ = fmt.Sscanf(outcome, "http_%d", &status)
						w.WriteHeader(status)
						_, _ = io.WriteString(w, `{"error":{"message":"Stream must be set to true"}}`)
						return
					}
					switch outcome {
					case "disconnect":
						conn, _, err := w.(http.Hijacker).Hijack()
						if err != nil {
							t.Error(err)
							return
						}
						_ = conn.Close()
					case "deadline":
						w.Header().Set("Content-Type", "text/event-stream")
						w.WriteHeader(http.StatusOK)
						w.(http.Flusher).Flush()
						<-r.Context().Done()
					case "cancel_after_accept":
						cancel()
					case "truncated_stream":
						w.Header().Set("Content-Type", "text/event-stream")
						w.Header().Set("Content-Length", "4096")
						_, _ = io.WriteString(w, "data: {\"type\":\"response.created\"}\n\n")
					case "truncated_json":
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"output":[`)
					case "invalid_image":
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"output":[{"type":"image_generation_call","result":"not valid base64!"}]}`)
					case "missing_image":
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"output":[]}`)
					case "redirect":
						w.Header().Set("Location", "/v1/chat/completions")
						w.WriteHeader(http.StatusTemporaryRedirect)
					}
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "fixture-model", mode, "auto", []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				result, err := client.GenerateImage(ctx, ImageRequest{Prompt: "fixture image"})
				if err == nil || len(result.Data) != 0 {
					t.Fatalf("failure became success: result=%#v err=%v", result, err)
				}
				if got := requests.Load(); got != 1 {
					t.Fatalf("received %d HTTP requests for one image attempt; want exactly 1", got)
				}
				if client.ProtocolMode() != mode || client.StreamMode() != "auto" {
					t.Fatal("generation mutated shared provider configuration")
				}
			})
		}
	}
}

func TestImageHTTPProtocolAndStreamSelectionRemainExplicit(t *testing.T) {
	for _, mode := range []string{"", "auto", "responses", "chat_completions"} {
		for _, streamMode := range []string{"auto", "always", "never"} {
			t.Run(mode+"/"+streamMode, func(t *testing.T) {
				var requests atomic.Int32
				expectedPath := "/v1/responses"
				if mode == "chat_completions" {
					expectedPath = "/v1/chat/completions"
				}
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					if r.Method != http.MethodPost || r.URL.Path != expectedPath {
						t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if body["stream"] != (streamMode != "never") {
						t.Errorf("stream selection changed: %#v", body["stream"])
					}
					// Exercise both the existing common JSON image envelope
					// and Chat Completions' streamed data-URI response.
					if mode == "chat_completions" && streamMode != "never" {
						w.Header().Set("Content-Type", "text/event-stream")
						_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"data:image/png;base64,AQID\"}}]}\n\ndata: [DONE]\n\n")
					} else {
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"data":[{"b64_json":"AQID"}]}`)
					}
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "fixture-model", mode, streamMode, []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				result, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture image"})
				if err != nil || string(result.Data) != "\x01\x02\x03" || result.MIMEType != "image/png" || requests.Load() != 1 {
					t.Fatalf("explicit image selection failed: result=%#v requests=%d err=%v", result, requests.Load(), err)
				}
			})
		}
	}
}

func TestInvalidImageProtocolStopsBeforeHTTP(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "fixture-model", "unsupported", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture image"}); err == nil {
		t.Fatal("invalid protocol accepted")
	}
	if requests.Load() != 0 {
		t.Fatalf("invalid protocol sent %d requests", requests.Load())
	}
}


func TestGeminiImageHTTPFailuresNeverFallbackOrReplay(t *testing.T) {
	cases := []struct {
		name, mode, model, path string
	}{
		{"auto_imagen", "auto", "imagen-fixture", "/v1beta/models/imagen-fixture:predict"},
		{"empty_gemini", "", "gemini-fixture", "/v1beta/models/gemini-fixture:generateContent"},
		{"predict", "predict", "gemini-fixture", "/v1beta/models/gemini-fixture:predict"},
		{"generate_content", "generate_content", "imagen-fixture", "/v1beta/models/imagen-fixture:generateContent"},
	}
	for _, tc := range cases {
		for _, outcome := range []string{"http_500", "disconnect", "truncated_json", "missing_image"} {
			t.Run(tc.name+"/"+outcome, func(t *testing.T) {
				var requests atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					if r.Method != http.MethodPost || r.URL.Path != tc.path {
						t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					}
					_, _ = io.Copy(io.Discard, r.Body)
					_ = r.Body.Close()
					switch outcome {
					case "http_500":
						w.WriteHeader(http.StatusInternalServerError)
						_, _ = io.WriteString(w, `{"error":{"message":"fixture"}}`)
					case "disconnect":
						conn, _, err := w.(http.Hijacker).Hijack()
						if err != nil {
							t.Error(err)
							return
						}
						_ = conn.Close()
					case "truncated_json":
						w.Header().Set("Content-Type", "application/json")
						_, _ = io.WriteString(w, `{"candidates":[`)
					case "missing_image":
						w.Header().Set("Content-Type", "application/json")
						if strings.Contains(tc.path, ":predict") {
							_, _ = io.WriteString(w, `{"predictions":[]}`)
						} else {
							_, _ = io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":"no image"}]}}]}`)
						}
					}
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("gemini", server.URL, "fixture-key", tc.model, tc.mode, "auto", []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				result, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture image"})
				if err == nil || len(result.Data) != 0 {
					t.Fatalf("failure became success: result=%#v err=%v", result, err)
				}
				if got := requests.Load(); got != 1 {
					t.Fatalf("received %d Gemini HTTP requests for one image attempt; want exactly 1", got)
				}
			})
		}
	}
}

func TestInvalidGeminiImageProtocolStopsBeforeHTTP(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("gemini", server.URL, "fixture-key", "gemini-fixture", "unsupported", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture image"}); err == nil {
		t.Fatal("invalid Gemini image protocol accepted")
	}
	if requests.Load() != 0 {
		t.Fatalf("invalid Gemini protocol sent %d requests", requests.Load())
	}
}
