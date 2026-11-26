package agent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	"github.com/rushairer/blog-backend/internal/secretbox"
)

func TestProviderHealthCheckSelectsModalityBeforeDispatch(t *testing.T) {
	box, err := secretbox.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	const id int64 = 9
	ciphertext, nonce, err := box.EncryptWithAAD("fixture-key", secretbox.ProviderAPIKeyAAD(id, box.KeyVersion()))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, family, model, protocol, path, response string
		imageDefault, writingDefault, image            bool
	}{
		{"text", "openai", "text-fixture", "chat_completions", "/v1/chat/completions", `{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}`, false, false, false},
		{"both_defaults", "openai", "text-fixture", "chat_completions", "/v1/chat/completions", `{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}`, true, true, false},
		{"custom_image_default", "openai", "custom-fixture", "responses", "/v1/responses", `{"output":[{"type":"image_generation_call","result":"aW1hZ2U="}]}`, true, false, true},
		{"dall_e", "openai", "dall-e-fixture", "responses", "/v1/responses", `{"output":[{"type":"image_generation_call","result":"aW1hZ2U="}]}`, false, false, true},
		{"gpt_image", "openai", "gpt-image-fixture", "responses", "/v1/responses", `{"output":[{"type":"image_generation_call","result":"aW1hZ2U="}]}`, false, false, true},
		{"imagen", "gemini", "imagen-fixture", "auto", "/v1beta/models/imagen-fixture:predict", `{"predictions":[{"bytesBase64Encoded":"aW1hZ2U="}]}`, false, false, true},
		{"predict", "gemini", "custom-fixture", "predict", "/v1beta/models/custom-fixture:predict", `{"predictions":[{"bytesBase64Encoded":"aW1hZ2U="}]}`, false, false, true},
		{"gemini_image_default", "gemini", "custom-fixture", "generate_content", "/v1beta/models/custom-fixture:generateContent", `{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"aW1hZ2U="}}]}}]}`, true, false, true},
	}
	for _, tc := range cases {
		for _, outcome := range []string{"success", "bad_request", "unauthorized", "rate_limited", "server_error", "truncated", "cancelled"} {
			t.Run(tc.name+"/"+outcome, func(t *testing.T) {
				var count atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					count.Add(1)
					if r.URL.Path != tc.path {
						t.Errorf("path = %q, want %q", r.URL.Path, tc.path)
					}
					var body map[string]json.RawMessage
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Errorf("decode request: %v", err)
					}
					imageRequest := body["instances"] != nil || body["tool_choice"] != nil
					if tc.family == "gemini" && tc.protocol == "generate_content" {
						imageRequest = body["generationConfig"] != nil
					}
					if imageRequest != tc.image {
						t.Errorf("image modality = %v, want %v", imageRequest, tc.image)
					}
					w.Header().Set("Content-Type", "application/json")
					switch outcome {
					case "bad_request":
						w.WriteHeader(http.StatusBadRequest)
					case "unauthorized":
						w.WriteHeader(http.StatusUnauthorized)
					case "rate_limited":
						w.WriteHeader(http.StatusTooManyRequests)
					case "server_error":
						w.WriteHeader(http.StatusInternalServerError)
					case "truncated":
						_, _ = io.WriteString(w, "{")
						return
					default:
						_, _ = io.WriteString(w, tc.response)
						return
					}
					_, _ = io.WriteString(w, `{"error":{"message":"fixture rejected"}}`)
				}))
				defer server.Close()

				profile := &providerdomain.ProviderProfile{
					ID: id, Enabled: true, ProviderType: providerdomain.ProviderType(tc.family),
					BaseURL: server.URL, Model: tc.model, ProtocolMode: tc.protocol, StreamMode: "never",
					IsDefaultImage: tc.imageDefault, IsDefaultWriting: tc.writingDefault,
					APIKeyCiphertext: ciphertext, APIKeyNonce: nonce, KeyVersion: box.KeyVersion(),
					RequestTimeoutSeconds: 2,
				}
				later := *profile
				later.Model = "wrong-snapshot"
				store := &profileSnapshotStore{selected: profile, later: &later}
				service := NewManagementService(ManagementServiceDependencies{Providers: store}, box, []string{"127.0.0.1"}, nil, nil)
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				wantCount := int32(1)
				if outcome == "cancelled" {
					cancel()
					wantCount = 0
				}
				_, err := service.TestProvider(ctx, id)
				if (err == nil) != (outcome == "success") {
					t.Fatalf("outcome %s: err = %v", outcome, err)
				}
				if count.Load() != wantCount || store.reads != 1 {
					t.Fatalf("HTTP requests=%d want=%d, profile reads=%d want=1", count.Load(), wantCount, store.reads)
				}
			})
		}
	}
}
