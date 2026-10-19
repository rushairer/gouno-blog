package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestOpenAIToolNamesRoundTrip(t *testing.T) {
	for _, protocol := range []string{"responses", "chat_completions"} {
		for _, mode := range []string{"never", "always", "auto"} {
			t.Run(protocol+"/"+mode, func(t *testing.T) {
				calls := 0
				wireName := ""
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls++
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					tools := body["tools"].([]any)
					definition := tools[0].(map[string]any)
					choice := body["tool_choice"].(map[string]any)
					var history map[string]any
					if protocol == "chat_completions" {
						definition = definition["function"].(map[string]any)
						choice = choice["function"].(map[string]any)
						messages := body["messages"].([]any)
						history = messages[0].(map[string]any)["tool_calls"].([]any)[0].(map[string]any)["function"].(map[string]any)
					} else {
						history = body["input"].([]any)[0].(map[string]any)
					}
					name := definition["name"].(string)
					if !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`).MatchString(name) || name == "content.list_posts" {
						t.Errorf("invalid wire name: %q", name)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					if wireName != "" && wireName != name {
						t.Errorf("name changed during stream negotiation: %q != %q", wireName, name)
					}
					wireName = name
					if choice["name"] != name || history["name"] != name {
						t.Errorf("definition, forced choice and history disagree: %v %v %v", definition, choice, history)
					}
					if mode == "auto" && calls == 1 {
						w.WriteHeader(http.StatusBadRequest)
						_, _ = io.WriteString(w, requiredStreamErrorJSON)
						return
					}
					if body["stream"] == true {
						w.Header().Set("Content-Type", "text/event-stream")
						if protocol == "responses" {
							_, _ = fmt.Fprintf(w, "data: {\"type\":\"response.output_item.added\",\"item\":{\"id\":\"item_1\",\"call_id\":\"call_1\",\"name\":%q}}\n\ndata: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"item_1\",\"delta\":\"{}\"}\n\n", name)
						} else {
							_, _ = fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":%q,\"arguments\":\"{}\"}}]}}]}\n\ndata: [DONE]\n\n", name)
						}
					} else if protocol == "responses" {
						_, _ = fmt.Fprintf(w, `{"output":[{"type":"function_call","call_id":"call_1","name":%q,"arguments":"{}"}]}`, name)
					} else {
						_, _ = fmt.Fprintf(w, `{"choices":[{"message":{"tool_calls":[{"id":"call_1","function":{"name":%q,"arguments":"{}"}}]}}]}`, name)
					}
				}))
				defer server.Close()
				client, err := NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", protocol, mode, []string{"127.0.0.1"}, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				req := Request{
					Tools:      []ToolDefinition{{Name: "content.list_posts", Parameters: json.RawMessage(`{"type":"object"}`)}},
					ToolChoice: "content.list_posts",
					Messages:   []Message{{Role: "assistant", ToolCalls: []ToolCall{{ID: "old_call", Name: "content.list_posts", Arguments: json.RawMessage(`{}`)}}}},
				}
				result, err := client.Generate(context.Background(), req)
				if err != nil {
					t.Fatal(err)
				}
				if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "content.list_posts" || result.ToolCalls[0].ID != "call_1" || string(result.ToolCalls[0].Arguments) != `{}` {
					t.Fatalf("tool call not restored: %#v", result.ToolCalls)
				}
				if req.Tools[0].Name != "content.list_posts" || req.Messages[0].ToolCalls[0].Name != "content.list_posts" {
					t.Fatal("provider mutated caller-owned request")
				}
				wantCalls := 1
				if mode == "auto" {
					wantCalls = 2
				}
				if calls != wantCalls {
					t.Fatalf("HTTP calls = %d, want %d", calls, wantCalls)
				}
			})
		}
	}
}

func TestOpenAIToolNameMappingIsBoundedAndCollisionSafe(t *testing.T) {
	names := []string{"content.list_posts", "content__list_posts", "content_list_posts", "valid-name_1", "工具.搜索", strings.Repeat("x", 65), strings.Repeat("x", 64)}
	req := Request{}
	for _, name := range names {
		req.Tools = append(req.Tools, ToolDefinition{Name: name})
	}
	mapped, originals, err := mapOpenAIToolNames(req)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for index, tool := range mapped.Tools {
		if !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`).MatchString(tool.Name) || seen[tool.Name] || originals[tool.Name] != names[index] {
			t.Fatalf("invalid mapping: %#v / %#v", mapped.Tools, originals)
		}
		seen[tool.Name] = true
	}
	if mapped.Tools[3].Name != names[3] {
		t.Fatal("valid tool name changed")
	}
	if mapped.Tools[6].Name != names[6] {
		t.Fatal("valid maximum-length name changed")
	}
	req.Tools = append(req.Tools, ToolDefinition{Name: mapped.Tools[0].Name})
	if _, _, err := mapOpenAIToolNames(req); err == nil {
		t.Fatal("wire alias collision must fail closed")
	}
}

func TestOpenAIToolNameValidationStopsBeforeDispatch(t *testing.T) {
	mapped, _, err := mapOpenAIToolNames(Request{Tools: []ToolDefinition{{Name: "content.list_posts"}}})
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", "responses", "always", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	for _, tools := range [][]ToolDefinition{
		{{Name: ""}},
		{{Name: "content.list_posts"}, {Name: mapped.Tools[0].Name}},
		{{Name: mapped.Tools[0].Name}, {Name: "content.list_posts"}},
	} {
		if _, err := client.Generate(context.Background(), Request{Tools: tools}); err == nil {
			t.Fatal("invalid name mapping must fail closed")
		}
	}
	if calls != 0 {
		t.Fatalf("invalid mapping dispatched %d HTTP requests", calls)
	}
}

func TestOpenAIToolNamesDoNotGuessUnknownNames(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"output":[{"type":"function_call","call_id":"call_1","name":"unregistered__tool","arguments":"{}"}]}`)
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.Generate(context.Background(), Request{Tools: []ToolDefinition{{Name: "content.list_posts", Parameters: json.RawMessage(`{}`)}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].Name != "unregistered__tool" {
		t.Fatalf("unregistered tool name must not be guessed: %#v", result.ToolCalls)
	}
}
