package provider

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOfficialOpenAIClientRequestHeaderEligibility(t *testing.T) {
	p := &HTTPProvider{vendor: "openai", baseURL: "https://api.openai.com"}
	headers := p.officialOpenAIClientRequestHeaders("0123456789abcdef0123456789abcdef")
	if headers["X-Client-Request-Id"] != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("official OpenAI request correlation header missing: %#v", headers)
	}

	for _, tc := range []struct {
		name, vendor, baseURL, id string
	}{
		{"custom vendor", "custom", "https://api.openai.com", "abc"},
		{"custom host", "openai", "https://example.com", "abc"},
		{"empty", "openai", "https://api.openai.com", ""},
		{"non ascii", "openai", "https://api.openai.com", "请求"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := &HTTPProvider{vendor: tc.vendor, baseURL: tc.baseURL}
			if got := p.officialOpenAIClientRequestHeaders(tc.id); len(got) != 0 {
				t.Fatalf("unverified target received OpenAI client request ID: %#v", got)
			}
		})
	}
}

func TestOpenAIImageCapturesOfficialResponseEvidenceWithoutForwardingToCustomHost(t *testing.T) {
	var clientRequestID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientRequestID = r.Header.Get("X-Client-Request-Id")
		w.Header().Set("x-request-id", "req_openai_fixture")
		w.Header().Set("openai-organization", "org_openai_fixture")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"AQID"}]}`)
	}))
	defer server.Close()

	p, err := NewHTTPProviderWithVendorConfig("openai", "openai", server.URL, "key", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := p.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture", ClientRequestID: "0123456789abcdef0123456789abcdef"})
	if err != nil {
		t.Fatal(err)
	}
	if clientRequestID != "" {
		t.Fatalf("client correlation header leaked to non-official host: %q", clientRequestID)
	}
	if result.Evidence.RequestID != "req_openai_fixture" || result.Evidence.AccountID != "org_openai_fixture" || result.Evidence.ClientRequestIDSent {
		t.Fatalf("unexpected OpenAI evidence: %#v", result.Evidence)
	}
}

func TestOpenAIHTTPErrorRetainsResponseEvidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_openai_error")
		w.Header().Set("openai-organization", "org_openai_error")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":{"message":"fixture"}}`)
	}))
	defer server.Close()

	p, err := NewHTTPProviderWithVendorConfig("openai", "openai", server.URL, "key", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture"})
	if err == nil {
		t.Fatal("expected upstream error")
	}
	evidence := RequestEvidenceFromError(err)
	if evidence.RequestID != "req_openai_error" || evidence.AccountID != "org_openai_error" {
		t.Fatalf("OpenAI error evidence lost: %#v", evidence)
	}
}

func TestAnthropicImageCapturesRequestAndAccountEvidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("request-id", "req_anthropic_fixture")
		w.Header().Set("anthropic-organization-id", "org_anthropic_fixture")
		w.Header().Set("anthropic-workspace-id", "ws_anthropic_fixture")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"AQID"}}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`)
	}))
	defer server.Close()

	p, err := NewHTTPProviderWithVendorConfig("anthropic", "anthropic", server.URL, "key", "model", "", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := p.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Evidence.RequestID != "req_anthropic_fixture" ||
		result.Evidence.AccountID != "org_anthropic_fixture" ||
		result.Evidence.WorkspaceID != "ws_anthropic_fixture" {
		t.Fatalf("Anthropic response evidence lost: %#v", result.Evidence)
	}
}

func TestAnthropicErrorBodyRequestIDIsRetained(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"type":"error","error":{"type":"invalid_request_error","message":"fixture"},"request_id":"req_anthropic_error"}`)
	}))
	defer server.Close()

	p, err := NewHTTPProviderWithVendorConfig("anthropic", "anthropic", server.URL, "key", "model", "", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture"})
	if err == nil {
		t.Fatal("expected upstream error")
	}
	if got := RequestEvidenceFromError(err).RequestID; got != "req_anthropic_error" {
		t.Fatalf("Anthropic error request ID lost: %q", got)
	}
}

func TestGeminiGenerateContentCapturesResponseID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"responseId":"resp_gemini_fixture","candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"AQID"}}]}}]}`)
	}))
	defer server.Close()

	p, err := NewHTTPProviderWithVendorConfig("gemini", "google", server.URL, "key", "gemini-fixture", "generate_content", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := p.GenerateImage(context.Background(), ImageRequest{Prompt: "fixture"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Evidence.RequestID != "resp_gemini_fixture" {
		t.Fatalf("Gemini responseId lost: %#v", result.Evidence)
	}
}
