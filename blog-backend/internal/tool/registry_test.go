package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestRegistryEnforcesCapabilityBeforeExecution(t *testing.T) {
	executed := false
	registry := New(Definition{
		Name: "safe.read", Risk: domain.ToolRiskRead,
		Parameters: json.RawMessage(`{"type":"object"}`),
		Execute: func(context.Context, json.RawMessage) (any, error) {
			executed = true
			return map[string]bool{"ok": true}, nil
		},
	})
	_, _, _, err := registry.Invoke(context.Background(), nil, "safe.read", json.RawMessage(`{}`))
	if !errors.Is(err, ErrUnauthorized) || executed {
		t.Fatalf("err = %v, executed = %v", err, executed)
	}
}

func TestRegistryCreatesProposalWithoutExecutingWrite(t *testing.T) {
	registry := New(Definition{
		Name: "content.propose", Risk: domain.ToolRiskPropose,
		Parameters: json.RawMessage(`{"type":"object"}`),
		Propose: func(context.Context, json.RawMessage) (*Proposal, error) {
			return &Proposal{
				ActionType: "create_draft", TargetType: "post",
				Payload: json.RawMessage(`{"title":"Draft"}`),
			}, nil
		},
	})
	risk, result, proposal, err := registry.Invoke(
		context.Background(), []string{"content.propose"}, "content.propose", json.RawMessage(`{}`),
	)
	if err != nil || risk != domain.ToolRiskPropose || proposal == nil ||
		!json.Valid(result) || proposal.ActionType != "create_draft" {
		t.Fatalf("risk=%s result=%s proposal=%#v err=%v", risk, result, proposal, err)
	}
}

func TestRegistryRejectsInvalidJSON(t *testing.T) {
	registry := New(Definition{Name: "safe.read", Risk: domain.ToolRiskRead})
	_, _, _, err := registry.Invoke(
		context.Background(), []string{"safe.read"}, "safe.read", json.RawMessage(`{`),
	)
	if !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("err = %v", err)
	}
}

func TestMergeBindingArgumentsPinsConfiguredValues(t *testing.T) {
	bindings := json.RawMessage(`{"rss.fetch":{"feeds":[{"name":"OpenAI","url":"https://openai.com/news/rss.xml"}],"max_items":10}}`)
	merged, err := MergeBindingArguments(bindings, "rss.fetch", json.RawMessage(`{"feeds":[{"name":"untrusted","url":"https://example.test/feed"}],"max_items":50,"max_per_feed":3}`))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(merged, &got); err != nil {
		t.Fatal(err)
	}
	if got["max_items"] != float64(10) || got["max_per_feed"] != float64(3) {
		t.Fatalf("merged values = %#v", got)
	}
	feeds, ok := got["feeds"].([]any)
	if !ok || feeds[0].(map[string]any)["name"] != "OpenAI" {
		t.Fatalf("configured feeds must override model input: %#v", got)
	}
}

func TestDailyNewsReadToolsValidateTheirBoundary(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil)
	for name, arguments := range map[string]json.RawMessage{
		"rss.fetch":       json.RawMessage(`{"feeds":[{"name":"untrusted","url":"http://example.test/feed"}]}`),
		"data.json_parse": json.RawMessage(`{"text":"not JSON"}`),
	} {
		_, _, _, err := registry.Invoke(context.Background(), []string{name}, name, arguments)
		if !errors.Is(err, ErrInvalidArgument) {
			t.Fatalf("%s accepted unsafe input: %v", name, err)
		}
	}
}

func TestRegistryExposesOnlyAgentTools(t *testing.T) {
	registry := New(
		Definition{Name: "agent.only", Risk: domain.ToolRiskRead},
		Definition{Name: "also.agent", Surfaces: []string{"agent"}, Risk: domain.ToolRiskRead},
	)
	if names := registry.AgentNames(); len(names) != 2 || names[0] != "agent.only" {
		t.Fatalf("agent names = %v", names)
	}
	items := registry.Catalog()
	if len(items) != 2 || len(items[0].Surfaces) != 1 || items[0].Surfaces[0] != "agent" {
		t.Fatalf("catalog did not expose Tool surfaces: %#v", items)
	}
	if _, err := json.Marshal(items); err != nil {
		t.Fatalf("catalog must always be JSON serializable: %v", err)
	}
}

func TestRegistryRejectsInvalidCatalogSchemas(t *testing.T) {
	registry := New()
	if err := registry.Register(Definition{Name: "invalid.parameters", Parameters: json.RawMessage(`{`)}); !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("invalid parameters schema error = %v", err)
	}
	if err := registry.Register(Definition{Name: "invalid.output", Parameters: json.RawMessage(`{}`), Output: json.RawMessage(`{`)}); !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("invalid output schema error = %v", err)
	}
}

func TestCatalogRecoversFromInvalidStaticSchema(t *testing.T) {
	registry := New(Definition{Name: "legacy.invalid", Parameters: json.RawMessage(`{`), Output: json.RawMessage(`{`)})
	items := registry.Catalog()
	if len(items) != 1 || !json.Valid(items[0].Parameters) || len(items[0].Output) != 0 {
		t.Fatalf("catalog item = %#v", items)
	}
	if _, err := json.Marshal(items); err != nil {
		t.Fatalf("recovered catalog must be JSON serializable: %v", err)
	}
}

func TestBlogProposalToolsValidateArgumentsBeforeApproval(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil)
	tests := []struct {
		name string
		args string
	}{
		{"content.propose_draft", `{"title":"Draft","content":"","unexpected":true}`},
		{"comments.propose_reply", `{"comment_id":0,"content":"reply"}`},
		{"content.propose_task", `{"title":"Task","description":"Do it","priority":"urgent"}`},
	}
	for _, test := range tests {
		_, _, proposal, err := registry.Invoke(
			context.Background(), []string{test.name}, test.name, json.RawMessage(test.args),
		)
		if !errors.Is(err, ErrInvalidArgument) || proposal != nil {
			t.Fatalf("%s: proposal=%#v err=%v", test.name, proposal, err)
		}
	}
}

func TestReplyProposalCapturesTargetAndNormalizedPayload(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil)
	_, _, proposal, err := registry.Invoke(
		context.Background(), []string{"comments.propose_reply"},
		"comments.propose_reply", json.RawMessage(`{"comment_id":42,"content":"Thanks"}`),
	)
	if err != nil || proposal == nil || proposal.TargetID == nil || *proposal.TargetID != 42 {
		t.Fatalf("proposal=%#v err=%v", proposal, err)
	}
}

func TestDistributionDraftRejectsUnsafeOrMalformedInput(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil)
	for _, arguments := range []string{
		`{"post_id":1,"format":"publish","body":"Send this"}`,
		`{"post_id":1,"format":"social","body":"","unexpected":true}`,
	} {
		_, _, proposal, err := registry.Invoke(context.Background(), []string{"content.propose_distribution_draft"}, "content.propose_distribution_draft", json.RawMessage(arguments))
		if !errors.Is(err, ErrInvalidArgument) || proposal != nil {
			t.Fatalf("arguments=%s proposal=%#v err=%v", arguments, proposal, err)
		}
	}
}
