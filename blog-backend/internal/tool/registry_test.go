package tool

import (
	"context"
	"encoding/json"
	"errors"
	tooldomain "github.com/rushairer/blog-backend/internal/tool/domain"
	"testing"
)

func TestRegistryEnforcesCapabilityBeforeExecution(t *testing.T) {
	executed := false
	registry := New(Definition{
		Name: "safe.read", Risk: tooldomain.ToolRiskRead,
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
		Name: "content.propose", Risk: tooldomain.ToolRiskPropose,
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
	if err != nil || risk != tooldomain.ToolRiskPropose || proposal == nil ||
		!json.Valid(result) || proposal.ActionType != "create_draft" {
		t.Fatalf("risk=%s result=%s proposal=%#v err=%v", risk, result, proposal, err)
	}
}

func TestRegistryRejectsInvalidJSON(t *testing.T) {
	registry := New(Definition{Name: "safe.read", Risk: tooldomain.ToolRiskRead})
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
	registry := NewBlogRegistry(nil, nil, nil, nil)
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
		Definition{Name: "agent.only", Risk: tooldomain.ToolRiskRead},
		Definition{Name: "also.agent", Surfaces: []string{"agent"}, Risk: tooldomain.ToolRiskRead},
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
	registry := NewBlogRegistry(nil, nil, nil, nil)
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
	registry := NewBlogRegistry(nil, nil, nil, nil)
	_, _, proposal, err := registry.Invoke(
		context.Background(), []string{"comments.propose_reply"},
		"comments.propose_reply", json.RawMessage(`{"comment_id":42,"content":"Thanks"}`),
	)
	if err != nil || proposal == nil || proposal.TargetID == nil || *proposal.TargetID != 42 {
		t.Fatalf("proposal=%#v err=%v", proposal, err)
	}
}

func TestDistributionDraftRejectsUnsafeOrMalformedInput(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
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


func TestRegistryFiltersCatalogBySurface(t *testing.T) {
	registry := New(
		Definition{Name: "agent.only", Risk: tooldomain.ToolRiskRead},
		Definition{Name: "shared.read", Surfaces: []string{"agent", "external"}, Risk: tooldomain.ToolRiskRead},
		Definition{Name: "external.only", Surfaces: []string{"external"}, Risk: tooldomain.ToolRiskRead},
	)
	items := registry.CatalogForSurface("external")
	if len(items) != 2 || items[0].Name != "external.only" || items[1].Name != "shared.read" {
		t.Fatalf("external catalog = %#v", items)
	}
	if registry.SupportsSurface("agent.only", "external") {
		t.Fatal("agent-only tool unexpectedly supports external surface")
	}
	if !registry.SupportsSurface("shared.read", "external") {
		t.Fatal("shared tool must support external surface")
	}
}


func TestBlogRegistryDoesNotAdvertiseKnowledgeExternallyWithoutKnowledgeService(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	if registry.SupportsSurface("content.search_knowledge", "external") {
		t.Fatal("knowledge search must not advertise external availability without a knowledge service")
	}
	if !registry.SupportsSurface("content.list_published_posts", "external") {
		t.Fatal("published content read capability must remain externally available without AI")
	}
}


func TestExternalCatalogDoesNotExposeAdministrativeAnalyticsSummary(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	if registry.SupportsSurface("analytics.get_summary", "external") {
		t.Fatal("administrative analytics summary must not be exposed externally")
	}
	if !registry.SupportsSurface("analytics.list_low_engagement_posts", "external") {
		t.Fatal("published low-engagement analysis should remain externally available")
	}
}

func TestExternalContentCatalogNeverExposesAdminStateReaders(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)

	for _, name := range []string{
		"content.list_posts",
		"content.get_post",
		"content.list_pages",
		"content.get_page",
		"content.find_related",
	} {
		if registry.SupportsSurface(name, "external") {
			t.Fatalf("admin-state tool %q must not be exposed externally", name)
		}
	}

	for _, name := range []string{
		"content.list_published_posts",
		"content.get_published_post",
		"content.list_published_pages",
		"content.get_published_page",
	} {
		if !registry.SupportsSurface(name, "external") {
			t.Fatalf("published-safe tool %q must be exposed externally", name)
		}
	}
}

func TestExternalReadDispatchCannotReachWriteProposalOrAgentOnlyTools(t *testing.T) {
	calls := 0
	execute := func(context.Context, json.RawMessage) (any, error) {
		calls++
		return map[string]bool{"ok": true}, nil
	}
	propose := func(context.Context, json.RawMessage) (*Proposal, error) {
		calls++
		return &Proposal{ActionType: "unexpected"}, nil
	}
	registry := New(
		Definition{Name: "read", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"external"}, Execute: execute},
		Definition{Name: "agent", Risk: tooldomain.ToolRiskRead, Execute: execute},
		Definition{Name: "write", Risk: tooldomain.ToolRiskWrite, Surfaces: []string{"external"}, Execute: execute},
		Definition{Name: "propose", Risk: tooldomain.ToolRiskPropose, Surfaces: []string{"external"}, Propose: propose},
		Definition{Name: "unbound", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"external"}},
		Definition{Name: "mixed", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"external"}, Execute: execute, Propose: propose},
	)
	catalog := registry.ExternalReadCatalog()
	if len(catalog) != 1 || catalog[0].Name != "read" {
		t.Fatalf("external read catalog = %#v", catalog)
	}
	for _, name := range []string{"agent", "write", "propose", "unbound", "mixed", "missing"} {
		result, err := registry.InvokeExternalRead(context.Background(), []string{name}, name, json.RawMessage(`{}`))
		if result != nil || !errors.Is(err, ErrUnauthorized) || calls != 0 {
			t.Fatalf("%s reached dispatch: result=%s err=%v calls=%d", name, result, err, calls)
		}
	}
	if _, err := registry.InvokeExternalRead(context.Background(), nil, "read", json.RawMessage(`{}`)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("missing grant: %v", err)
	}
	if _, err := registry.InvokeExternalRead(context.Background(), []string{"read"}, "read", json.RawMessage(`{`)); !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("invalid arguments: %v", err)
	}
	if calls != 0 {
		t.Fatalf("unauthorized or invalid call reached handler: %d", calls)
	}
	result, err := registry.InvokeExternalRead(context.Background(), []string{"read"}, "read", json.RawMessage(`{}`))
	if err != nil || string(result) != `{"ok":true}` || calls != 1 {
		t.Fatalf("authorized read: result=%s err=%v calls=%d", result, err, calls)
	}
}

func TestRegistryOwnsAndReturnsDetachedAuthorityMetadata(t *testing.T) {
	for _, register := range []bool{false, true} {
		definition := Definition{
			Name: "agent.read", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"agent"},
			Parameters: json.RawMessage(`{"type":"object"}`),
			Configuration: json.RawMessage(`{"type":"object"}`),
			DefaultBinding: json.RawMessage(`{"limit":10}`),
			Output: json.RawMessage(`{"type":"object"}`),
			Scope: &ScopeRule{ResourceType: "post", OutputKeys: []string{"id"}},
			Execute: func(context.Context, json.RawMessage) (any, error) {
				return nil, nil
			},
		}
		registry := New()
		if register {
			if err := registry.Register(definition); err != nil {
				t.Fatal(err)
			}
		} else {
			registry = New(definition)
		}
		definition.Surfaces[0] = "external"
		definition.Scope.ResourceType = "page"
		definition.Scope.OutputKeys[0] = "other"
		definition.Parameters[0] = '!'
		definition.Configuration[0] = '!'
		definition.DefaultBinding[0] = '!'
		definition.Output[0] = '!'
		// Mutate each public metadata view and verify the next reader sees the
		// original authority and schemas, not these accidental modifications.
		for _, item := range append(registry.Catalog(), registry.CatalogForSurface("agent")...) {
			item.Surfaces[0] = "external"
			item.Scope.ResourceType = "page"
			item.Scope.OutputKeys[0] = "other"
			item.Parameters[0] = '!'
			item.ConfigurationSchema[0] = '!'
			item.DefaultBinding[0] = '!'
			item.Output[0] = '!'
		}
		scope, ok := registry.Scope("agent.read")
		if !ok || scope == nil {
			t.Fatal("scope missing")
		}
		scope.ResourceType = "page"
		scope.OutputKeys[0] = "other"
		definitions := registry.Definitions([]string{"agent.read"})
		if len(definitions) != 1 {
			t.Fatalf("agent definitions = %#v", definitions)
		}
		definitions[0].Parameters[0] = '!'
		item := registry.Catalog()[0]
		if registry.SupportsSurface("agent.read", "external") || len(registry.ExternalReadCatalog()) != 0 ||
			item.Scope.ResourceType != "post" || item.Scope.OutputKeys[0] != "id" ||
			string(item.Parameters) != `{"type":"object"}` || string(item.ConfigurationSchema) != `{"type":"object"}` ||
			string(item.DefaultBinding) != `{"limit":10}` || string(item.Output) != `{"type":"object"}` {
			t.Fatalf("registry metadata changed after caller mutation: %#v", item)
		}
	}
}
