package workflowplan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	"github.com/rushairer/blog-backend/internal/tool"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

func TestPlannerResponseContractHTTP(t *testing.T) {
	const valid = `{"intent":{"version":"workflow-intent/v2","status":"ready","trigger":{"type":"manual"},"operations":[{"step_id":"read","required_capabilities":["content.read"]}]},"workflow":{"name":"draft","enabled":true,"input_schema":{"type":"object","additionalProperties":false},"steps":[{"id":"read","type":"model","agent_id":10}]}}`
	invalid := strings.Replace(valid, "workflow-intent/v2", "invalid", 1)
	quote := func(s string) string { b, _ := json.Marshal(s); return string(b) }
	chat := func(draft, reason string) string {
		return fmt.Sprintf(`{"choices":[{"message":{"content":%s},"finish_reason":%q}]}`, quote(draft), reason)
	}
	toolResponse := func(name, args string, duplicate bool) string {
		call := fmt.Sprintf(`{"id":"c1","type":"function","function":{"name":%q,"arguments":%s}}`, name, quote(args))
		if duplicate {
			call += "," + strings.Replace(call, "c1", "c2", 1)
		}
		return `{"choices":[{"message":{"tool_calls":[` + call + `]},"finish_reason":"tool_calls"}]}`
	}
	type response struct {
		status int
		body   string
	}
	for _, tc := range []struct {
		name, vendor, protocol string
		responses              []response
		wantErr                error
		wantCode               string
	}{
		{"chat-text", "openai", "chat_completions", []response{{200, chat(valid, "stop")}}, nil, ""},
		{"chat-tool", "openai", "chat_completions", []response{{200, toolResponse(workflowDraftToolName, valid, false)}}, nil, ""},
		{"chat-incomplete", "openai", "chat_completions", []response{{200, chat(valid, "length")}}, provider.ErrTextResponseIncomplete, ""},
		{"chat-refusal", "openai", "chat_completions", []response{{200, `{"choices":[{"message":{"content":` + quote(valid) + `,"refusal":"blocked"},"finish_reason":"stop"}]}`}}, provider.ErrTextResponseRejected, ""},
		{"responses-incomplete", "openai", "responses", []response{{200, `{"status":"incomplete","output_text":` + quote(valid) + `}`}}, provider.ErrTextResponseIncomplete, ""},
		{"responses-refusal", "openai", "responses", []response{{200, `{"status":"completed","output_text":` + quote(valid) + `,"output":[{"type":"message","content":[{"type":"refusal"}]}]}`}}, provider.ErrTextResponseRejected, ""},
		{"anthropic-incomplete", "anthropic", "", []response{{200, `{"stop_reason":"max_tokens","content":[{"type":"text","text":` + quote(valid) + `}]}`}}, provider.ErrTextResponseIncomplete, ""},
		{"gemini-incomplete", "gemini", "", []response{{200, `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":` + quote(valid) + `}]}}]}`}}, provider.ErrTextResponseIncomplete, ""},
		{"gemini-missing-arguments", "gemini", "", []response{{200, `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"functionCall":{"name":"submit_workflow_draft"}}]}}]}`}}, provider.ErrTextResponseInvalid, ""},
		{"duplicate-submissions", "openai", "chat_completions", []response{{200, toolResponse(workflowDraftToolName, valid, true)}}, provider.ErrTextResponseInvalid, ""},
		{"unknown-submission", "openai", "chat_completions", []response{{200, toolResponse("unexpected", valid, false)}}, provider.ErrTextResponseInvalid, ""},
		{"correction-succeeds", "openai", "chat_completions", []response{{200, chat(invalid, "stop")}, {200, chat(valid, "stop")}}, nil, ""},
		{"correction-does-not-inherit", "openai", "chat_completions", []response{{200, chat(invalid, "stop")}, {200, chat(`{"intent":{"version":"workflow-intent/v2","status":"ready","trigger":{"type":"manual"},"operations":[{"step_id":"read","required_capabilities":["content.read"]}]}}`, "stop")}}, ErrPlannerContract, ""},
		{"correction-incomplete", "openai", "chat_completions", []response{{200, chat(invalid, "stop")}, {200, chat(valid, "length")}}, provider.ErrTextResponseIncomplete, ""},
		{"correction-rate-limited", "openai", "chat_completions", []response{{200, chat(invalid, "stop")}, {429, `{"error":{"message":"quota"}}`}}, nil, "provider_rate_limited"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				n := int(requests.Add(1)) - 1
				if n >= len(tc.responses) {
					w.WriteHeader(http.StatusInternalServerError)
					return
				}
				var body map[string]json.RawMessage
				if json.NewDecoder(r.Body).Decode(&body) != nil {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.responses[n].status)
				_, _ = w.Write([]byte(tc.responses[n].body))
			}))
			defer server.Close()
			client, err := provider.NewHTTPProviderWithConfig(tc.vendor, server.URL, "fixture-key", "model", tc.protocol, "never", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			profile := &providerdomain.ProviderProfile{ID: 1, Enabled: true, IsDefaultWriting: true}
			skill := &domain.AgentSkill{VersionID: 2, Capabilities: []string{"content.read"}}
			agent := &domain.Agent{ID: 10, Enabled: true, SkillVersionID: &skill.VersionID, Skill: skill}
			validations := 0
			result, err := PlanWorkflow(context.Background(), "read content", []*providerdomain.ProviderProfile{profile}, []*domain.Agent{agent}, []tool.CatalogItem{{Name: "content.read"}}, func(draft *workflowdomain.Workflow) error {
				validations++
				if draft.Enabled || draft.Name != "draft" {
					t.Fatalf("unexpected draft: %#v", draft)
				}
				return nil
			}, func(context.Context, int64) (provider.Provider, error) { return client, nil })
			if requests.Load() != int32(len(tc.responses)) {
				t.Fatalf("HTTP requests=%d, want %d; err=%v", requests.Load(), len(tc.responses), err)
			}
			if tc.wantCode != "" {
				if err == nil || provider.TextFailureCode(err) != tc.wantCode || errors.Is(err, ErrPlannerContract) || result != nil || validations != 0 {
					t.Fatalf("correction error lost: result=%#v err=%v validations=%d", result, err, validations)
				}
			} else if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) || result != nil || validations != 0 {
					t.Fatalf("result=%#v err=%v want=%v validations=%d", result, err, tc.wantErr, validations)
				}
			} else if err != nil || result == nil || validations != 1 {
				t.Fatalf("result=%#v err=%v validations=%d", result, err, validations)
			}
		})
	}
}
