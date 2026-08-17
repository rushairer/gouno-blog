package provider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestOpenAIGenerateParsesToolCallWithoutLeakingKey(t *testing.T) {
	var authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status":"completed",
			"output":[{"type":"function_call","call_id":"call_1","name":"content.list_posts","arguments":"{\"limit\":5}"}],
			"usage":{"input_tokens":12,"output_tokens":7}
		}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("openai", server.URL, "top-secret", "gpt-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Instructions: "test",
		Messages:     []Message{{Role: "user", Content: "list posts"}},
		Tools: []ToolDefinition{{
			Name: "content.list_posts", Description: "list",
			Parameters: json.RawMessage(`{"type":"object","properties":{"limit":{"type":"integer"}}}`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if authorization != "Bearer top-secret" {
		t.Fatalf("authorization = %q", authorization)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" ||
		string(result.ToolCalls[0].Arguments) != `{"limit":5}` {
		t.Fatalf("tool calls = %#v", result.ToolCalls)
	}
	if result.InputTokens != 12 || result.OutputTokens != 7 {
		t.Fatalf("usage = %d/%d", result.InputTokens, result.OutputTokens)
	}
}

func TestOpenAIGenerateParsesChatCompletions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/responses" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"choices":[{
				"message":{
					"role":"assistant",
					"content":"OK",
					"tool_calls":[{"id":"call_123","type":"function","function":{"name":"content.list_posts","arguments":"{\"limit\":5}"}}]
				},
				"finish_reason":"tool_calls"
			}],
			"usage":{"prompt_tokens":10,"completion_tokens":5}
		}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("openai", server.URL, "top-secret", "gpt-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Instructions: "test",
		Messages:     []Message{{Role: "user", Content: "list posts"}},
		Tools: []ToolDefinition{{
			Name: "content.list_posts", Description: "list",
			Parameters: json.RawMessage(`{"type":"object","properties":{"limit":{"type":"integer"}}}`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "OK" {
		t.Fatalf("text = %q", result.Text)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" ||
		string(result.ToolCalls[0].Arguments) != `{"limit":5}` {
		t.Fatalf("tool calls = %#v", result.ToolCalls)
	}
	if result.InputTokens != 10 || result.OutputTokens != 5 {
		t.Fatalf("usage = %d/%d", result.InputTokens, result.OutputTokens)
	}
}

func TestAnthropicGenerateParsesTextAndToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "secret" {
			t.Fatal("missing Anthropic key")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"content":[
				{"type":"text","text":"Checking."},
				{"type":"tool_use","id":"tool_1","name":"analytics.get_summary","input":{"days":7}}
			],
			"stop_reason":"tool_use",
			"usage":{"input_tokens":8,"output_tokens":4}
		}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "claude-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Messages: []Message{{Role: "user", Content: "report"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "Checking." || len(result.ToolCalls) != 1 ||
		string(result.ToolCalls[0].Arguments) != `{"days":7}` {
		t.Fatalf("result = %#v", result)
	}
}

func TestGeminiGenerateParsesTextAndToolCall(t *testing.T) {
	var requestPayload struct {
		Contents []struct {
			Role  string `json:"role"`
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"contents"`
		SystemInstruction struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"systemInstruction"`
		Tools []struct {
			FunctionDeclarations []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"functionDeclarations"`
		} `json:"tools"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-1.5-pro:generateContent" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if r.Header.Get("x-goog-api-key") != "secret" {
			t.Fatalf("missing or invalid key header: %s", r.Header.Get("x-goog-api-key"))
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &requestPayload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates": [{
				"content": {
					"role": "model",
					"parts": [
						{"text": "Analyzing..."},
						{"functionCall": {"name": "content__list_posts", "args": {"limit": 5}}}
					]
				},
				"finishReason": "STOP"
			}],
			"usageMetadata": {
				"promptTokenCount": 12,
				"candidatesTokenCount": 8
			}
		}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("gemini", server.URL, "secret", "gemini-1.5-pro", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Instructions: "System rule",
		Messages:     []Message{{Role: "user", Content: "fetch posts"}},
		Tools: []ToolDefinition{{
			Name:        "content.list_posts",
			Description: "list posts",
			Parameters:  json.RawMessage(`{"type":"object"}`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var args map[string]int
	if len(result.ToolCalls) > 0 {
		_ = json.Unmarshal(result.ToolCalls[0].Arguments, &args)
	}
	if result.Text != "Analyzing..." || len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" ||
		args["limit"] != 5 || result.InputTokens != 12 || result.OutputTokens != 8 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if len(requestPayload.Tools) != 1 || len(requestPayload.Tools[0].FunctionDeclarations) != 1 ||
		requestPayload.Tools[0].FunctionDeclarations[0].Name != "content__list_posts" {
		t.Fatalf("expected sanitized tool name in request: %#v", requestPayload.Tools)
	}
}

func TestGeminiImageParsesInlineData(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.0-flash:generateContent" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates": [{
				"content": {
					"parts": [
						{"inlineData": {"mimeType": "image/png", "data": "iVBORw0KGgo="}}
					]
				}
			}]
		}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("gemini", server.URL, "secret", "gemini-2.0-flash", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "draw sunset"})
	if err != nil {
		t.Fatal(err)
	}
	if image.MIMEType != "image/png" || len(image.Data) != 8 {
		t.Fatalf("image = %#v", image)
	}
}

func TestGeminiImageParsesImagenPredict(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/imagen-3.0-generate-002:predict" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"predictions": [
				{"bytesBase64Encoded": "/9j/4AAQ", "mimeType": "image/jpeg"}
			]
		}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("gemini", server.URL, "secret", "imagen-3.0-generate-002", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "draw flower"})
	if err != nil {
		t.Fatal(err)
	}
	if image.MIMEType != "image/jpeg" || len(image.Data) != 6 {
		t.Fatalf("image = %#v", image)
	}
}

func TestAnthropicCompatibleImageParsesMarkdownDataURI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"![image](data:image/jpeg;base64,/9j/4AAQ)"}]}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "gemini-image", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "blue circle"})
	if err != nil {
		t.Fatal(err)
	}
	if image.MIMEType != "image/jpeg" || len(image.Data) != 6 {
		t.Fatalf("image = %#v", image)
	}
}

func TestAnthropicCompatibleImageParsesNativeImageBlock(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"iVBORw0KGgo="}}]}`))
	}))
	defer server.Close()
	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "gemini-image", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "blue circle"})
	if err != nil {
		t.Fatal(err)
	}
	if image.MIMEType != "image/png" || len(image.Data) != 8 {
		t.Fatalf("image = %#v", image)
	}
}

func TestOpenAIImageParsesImageGenerationCall(t *testing.T) {
	var requestPayload struct {
		Model      string `json:"model"`
		Input      []struct {
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"input"`
		Tools      []map[string]any `json:"tools"`
		ToolChoice map[string]any   `json:"tool_choice"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &requestPayload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":[{"type":"image_generation_call","result":"iVBORw0KGgo="}]}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("openai", server.URL, "secret", "gpt-5.6-image", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "a red cat"})
	if err != nil {
		t.Fatal(err)
	}
	if len(requestPayload.Input) != 1 || requestPayload.Input[0].Role != "user" ||
		len(requestPayload.Input[0].Content) != 1 || requestPayload.Input[0].Content[0].Text != "a red cat" {
		t.Fatalf("expected input list with user message, got: %#v", requestPayload.Input)
	}
	if image.MIMEType != "image/png" || len(image.Data) != 8 {
		t.Fatalf("image = %#v", image)
	}
}

func TestOpenAIImageParsesDataURIAndOutputText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output_text":"![rendered](data:image/jpeg;base64,/9j/4AAQ)"}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("openai", server.URL, "secret", "gpt-5.6-image", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "sunset"})
	if err != nil {
		t.Fatal(err)
	}
	if image.MIMEType != "image/jpeg" || len(image.Data) != 6 {
		t.Fatalf("image = %#v", image)
	}
}

func TestOpenAIImageParsesSSEStream(t *testing.T) {
	var requestPayload struct {
		Stream bool `json:"stream"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &requestPayload)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"image_generation_call\",\"result\":\"iVBORw0KGgo=\"}}\n\ndata: {\"type\":\"response.completed\"}\n\ndata: [DONE]\n\n"))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("openai", server.URL, "secret", "gpt-5.6-image", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	image, err := client.GenerateImage(context.Background(), ImageRequest{Prompt: "sse sunset"})
	if err != nil {
		t.Fatal(err)
	}
	if !requestPayload.Stream {
		t.Fatalf("expected stream=true in request, got: %v", requestPayload.Stream)
	}
	if image.MIMEType != "image/png" || len(image.Data) != 8 {
		t.Fatalf("image = %#v", image)
	}
}

func TestAnthropicSanitizesToolNamesWithDots(t *testing.T) {
	var requestBody []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"content":[
				{"type":"tool_use","id":"tool_1","name":"content__list_posts","input":{"limit":5}}
			],
			"stop_reason":"tool_use",
			"usage":{"input_tokens":10,"output_tokens":5}
		}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "claude-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{
		Messages: []Message{
			{Role: "user", Content: "list posts"},
			{Role: "assistant", ToolCalls: []ToolCall{{ID: "tool_0", Name: "content.audit_post", Arguments: json.RawMessage(`{"id":1}`)}}},
		},
		Tools: []ToolDefinition{{
			Name: "content.list_posts", Description: "list", Parameters: json.RawMessage(`{}`),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	bodyStr := string(requestBody)
	if !strings.Contains(bodyStr, `"name":"content__list_posts"`) {
		t.Fatalf("expected sanitized tool definition name in request body, got: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"name":"content__audit_post"`) {
		t.Fatalf("expected sanitized assistant tool call name in request body, got: %s", bodyStr)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" {
		t.Fatalf("expected restored tool name content.list_posts, got: %#v", result.ToolCalls)
	}
}

func TestAnthropicMergesMultipleToolResultsIntoSingleUserMessage(t *testing.T) {
	var requestPayload struct {
		Messages []struct {
			Role    string `json:"role"`
			Content []struct {
				Type      string `json:"type"`
				ToolUseID string `json:"tool_use_id"`
				Text      string `json:"text"`
				ID        string `json:"id"`
				Name      string `json:"name"`
			} `json:"content"`
		} `json:"messages"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &requestPayload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"content":[{"type":"text","text":"All done."}],
			"stop_reason":"end_turn",
			"usage":{"input_tokens":15,"output_tokens":5}
		}`))
	}))
	defer server.Close()

	client, err := NewHTTPProvider("anthropic", server.URL, "secret", "claude-test", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Generate(context.Background(), Request{
		Messages: []Message{
			{Role: "user", Content: "Run audit"},
			{Role: "assistant", ToolCalls: []ToolCall{
				{ID: "call_01", Name: "content.audit_post", Arguments: json.RawMessage(`{}`)},
				{ID: "call_02", Name: "content.search_knowledge", Arguments: json.RawMessage(`{}`)},
			}},
			{Role: "tool", ToolCallID: "call_01", Content: `{"audit":"ok"}`},
			{Role: "tool", ToolCallID: "call_02", Content: `{"search":"ok"}`},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Should have 3 messages in total: user, assistant, user (containing both tool_result items)
	if len(requestPayload.Messages) != 3 {
		t.Fatalf("expected 3 messages, got %d: %#v", len(requestPayload.Messages), requestPayload.Messages)
	}
	if requestPayload.Messages[0].Role != "user" || requestPayload.Messages[1].Role != "assistant" || requestPayload.Messages[2].Role != "user" {
		t.Fatalf("expected strictly alternating roles user->assistant->user, got: %#v", requestPayload.Messages)
	}

	toolResults := requestPayload.Messages[2].Content
	if len(toolResults) != 2 {
		t.Fatalf("expected 2 tool_result blocks in the user message following assistant tool_use, got: %#v", toolResults)
	}
	if toolResults[0].ToolUseID != "call_01" || toolResults[1].ToolUseID != "call_02" {
		t.Fatalf("expected tool_result IDs call_01 and call_02, got: %#v", toolResults)
	}
}

func TestProviderAllowsPublicHTTPSWithoutAllowlist(t *testing.T) {
	client, err := NewHTTPProvider("openai", "https://1.1.1.1/v1", "secret", "model", nil, time.Second)
	if err != nil || client == nil {
		t.Fatalf("expected public HTTPS upstream to be accepted: %v", err)
	}
}

func TestProviderRequiresExplicitAllowlistForPrivateUpstream(t *testing.T) {
	if _, err := NewHTTPProvider("openai", "https://10.0.0.8/v1", "secret", "model", nil, time.Second); err == nil {
		t.Fatal("expected private upstream to require explicit allowlisting")
	}
	if _, err := NewHTTPProvider(
		"openai", "https://10.0.0.8/v1", "secret", "model", []string{"10.0.0.8"}, time.Second,
	); err != nil {
		t.Fatalf("expected explicitly allowed private upstream: %v", err)
	}
}

func TestProviderAlwaysRejectsUnsafeUpstream(t *testing.T) {
	tests := []struct {
		url   string
		hosts []string
	}{
		{"http://1.1.1.1", []string{"1.1.1.1"}},
		{"https://169.254.169.254", []string{"169.254.169.254"}},
		{"https://224.0.0.1", []string{"224.0.0.1"}},
		{"https://0.0.0.0", []string{"0.0.0.0"}},
	}
	for _, test := range tests {
		if _, err := NewHTTPProvider("openai", test.url, "secret", "model", test.hosts, time.Second); err == nil {
			t.Fatalf("expected %s to be rejected", test.url)
		}
	}
}

func TestProviderAllowsExplicitLoopbackForLocalDevelopment(t *testing.T) {
	if _, err := NewHTTPProvider(
		"openai", "http://127.0.0.1:8088", "secret", "model", []string{"127.0.0.1"}, time.Second,
	); err != nil {
		t.Fatalf("expected allowlisted loopback development upstream: %v", err)
	}
}

func TestProviderAllowsSyntheticDNSForHostnameButNotLiteralIP(t *testing.T) {
	address := netip.MustParseAddr("198.18.0.77")
	if err := validateAddresses([]netip.Addr{address}, false, true); err != nil {
		t.Fatalf("expected hostname Fake-IP to be accepted: %v", err)
	}
	if err := validateAddresses([]netip.Addr{address}, false, false); err == nil {
		t.Fatal("expected literal benchmark IP to require explicit allowlisting")
	}
}

func TestPublicAddressPolicyBlocksCarrierAndBenchmarkNetworks(t *testing.T) {
	for _, value := range []string{"100.64.0.1", "198.18.0.1", "10.0.0.1", "127.0.0.1"} {
		address := netip.MustParseAddr(value)
		if isPublicAddress(address) {
			t.Fatalf("expected %s to require allowlisting", value)
		}
	}
}

func TestUpstreamErrorBodyIsBounded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, strings.Repeat("x", 10000), http.StatusBadGateway)
	}))
	defer server.Close()
	client, _ := NewHTTPProvider("openai", server.URL, "secret", "model", []string{"127.0.0.1"}, time.Second)
	_, err := client.Generate(context.Background(), Request{Messages: []Message{{Role: "user", Content: "x"}}})
	if err == nil || len(err.Error()) > 2200 {
		t.Fatalf("unexpected error length: %v", err)
	}
}
