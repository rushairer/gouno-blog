package workflow

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestResolvePointer(t *testing.T) {
	document := map[string]any{"input": map[string]any{"items": []any{map[string]any{"id": float64(7)}}}}
	value, err := resolvePointer(document, "/input/items/0/id")
	if err != nil || value != float64(7) {
		t.Fatalf("value=%v err=%v", value, err)
	}
	if _, err := resolvePointer(document, "/input/missing"); err == nil {
		t.Fatal("expected unresolved pointer error")
	}
}

func TestWorkflowInputSchemaValidation(t *testing.T) {
	schema := json.RawMessage(`{
		"type":"object","additionalProperties":false,"required":["post_ids","format"],
		"properties":{
			"post_ids":{"type":"array","items":{"type":"integer"},"minItems":1,"maxItems":2,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},
			"format":{"type":"string","enum":["review","faq"]}
		}
	}`)
	if err := validateInputSchema(schema); err != nil {
		t.Fatalf("valid resource schema: %v", err)
	}
	if err := validateWorkflowInput(schema, map[string]any{"post_ids": []any{float64(1)}, "format": "faq"}); err != nil {
		t.Fatalf("valid input: %v", err)
	}
	for name, input := range map[string]any{
		"required": map[string]any{"post_ids": []any{float64(1)}},
		"count":    map[string]any{"post_ids": []any{float64(1), float64(2), float64(3)}, "format": "faq"},
		"enum":     map[string]any{"post_ids": []any{float64(1)}, "format": "publish"},
		"extra":    map[string]any{"post_ids": []any{float64(1)}, "format": "faq", "other": true},
	} {
		if err := validateWorkflowInput(schema, input); err == nil {
			t.Fatalf("%s input should be rejected", name)
		}
	}
	if err := validateInputSchema(json.RawMessage(`{"type":"object","properties":{"ids":{"type":"array","x-gouno-resource":"account"}}}`)); err == nil {
		t.Fatal("unsupported resource extension should be rejected")
	}
	if err := validateInputSchema(json.RawMessage(`{"type":"object","properties":{"post_ids":{"type":"array","items":{"type":"string"},"x-gouno-resource":"post"}}}`)); err == nil {
		t.Fatal("post resources must use integer IDs")
	}
	if err := validateInputSchema(json.RawMessage(`{"type":"object","properties":{"tags":{"type":"array","items":{"type":"integer"},"x-gouno-resource":"tag"}}}`)); err == nil {
		t.Fatal("tag resources must use string names")
	}
}

func TestResourceQueryRulesAndFilters(t *testing.T) {
	service := &Service{}
	valid := []domain.WorkflowStep{
		{ID: "select", Type: "resource_query", ResourceType: "post", MaxItems: 20, Filter: json.RawMessage(`{"status":"published","updated_before_days":180}`)},
		{ID: "model", Type: "model", AgentID: 7},
	}
	if err := service.validateSteps(valid, 0); err != nil {
		t.Fatalf("valid resource query: %v", err)
	}
	invalid := [][]domain.WorkflowStep{
		{{ID: "model", Type: "model", AgentID: 7}, {ID: "select", Type: "resource_query", ResourceType: "post", MaxItems: 20}},
		{{ID: "select", Type: "resource_query", ResourceType: "post", MaxItems: 101}},
		{{ID: "select", Type: "resource_query", ResourceType: "post", MaxItems: 20, Filter: json.RawMessage(`{"unknown":true}`)}},
		{{ID: "model", Type: "model", AgentID: 7, ContinueOnError: true}},
		{{ID: "loop", Type: "for_each", CollectionPointer: "/input/items", MaxItems: 2, Steps: []domain.WorkflowStep{{ID: "nested", Type: "resource_query", ResourceType: "post", MaxItems: 2}}}},
	}
	for index, steps := range invalid {
		if err := service.validateSteps(steps, 0); err == nil {
			t.Fatalf("invalid resource query %d should be rejected", index)
		}
	}
	if err := validateResourceFilters("comment", map[string]string{"reported": "sometimes"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid boolean filter error = %v", err)
	}
	if err := validateResourceFilters("media_asset", map[string]string{"created_after": "yesterday"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid date filter error = %v", err)
	}
	if err := validateResourceFilters("post", map[string]string{"published_within_days": "2"}); err != nil {
		t.Fatalf("relative publish filter error = %v", err)
	}
	if err := validateResourceFilters("media_asset", map[string]string{"missing_alt": "true"}); err != nil {
		t.Fatalf("missing Alt filter error = %v", err)
	}
}

func TestForEachModelCanIncludeRootInput(t *testing.T) {
	document := map[string]any{"input": map[string]any{"format": "newsletter"}}
	got := inputForStep(document, float64(42), "", true).(map[string]any)
	if got["item"] != float64(42) || got["input"].(map[string]any)["format"] != "newsletter" {
		t.Fatalf("context input = %#v", got)
	}
	if legacy := inputForStep(document, float64(42), "", false); legacy != float64(42) {
		t.Fatalf("legacy input changed: %#v", legacy)
	}
}

func TestWorkflowAgentIDsIncludeNestedModels(t *testing.T) {
	steps := []domain.WorkflowStep{{ID: "outer", Type: "model", AgentID: 3}, {
		ID: "loop", Type: "for_each", Steps: []domain.WorkflowStep{
			{ID: "inner", Type: "model", AgentID: 7},
			{ID: "duplicate", Type: "model", AgentID: 3},
		},
	}}
	ids := workflowAgentIDs(steps)
	if len(ids) != 2 || ids[0] != 3 || ids[1] != 7 {
		t.Fatalf("Agent IDs = %v", ids)
	}
}

func TestResourceSnapshotKeepsOnlyMinimalAuditMetadata(t *testing.T) {
	item := &domain.ResourceOption{Label: "Comment #17", Description: "private discussion text", Status: "pending", Metadata: map[string]any{"post_id": float64(4), "url": "/media/private.jpg"}}
	raw := resourceSnapshot(item)
	if strings.Contains(string(raw), "private discussion") || strings.Contains(string(raw), "/media/private.jpg") || !strings.Contains(string(raw), "post_id") {
		t.Fatalf("resource snapshot = %s", raw)
	}
}

func TestValidateStepsRejectsToolAndUnboundedLoop(t *testing.T) {
	service := &Service{}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "one", Type: "tool"}}, 0); err == nil {
		t.Fatal("Workflow must not execute Tools directly")
	}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "loop", Type: "for_each", CollectionPointer: "/items", MaxItems: 101}}, 0); err == nil {
		t.Fatal("unbounded loop should be rejected")
	}
}

func TestValidateWorkflowRequiresFixedAgent(t *testing.T) {
	service := &Service{}
	steps := []domain.WorkflowStep{
		{ID: "model", Type: "model"},
		{ID: "approval", Type: "approval_gate"},
		{ID: "result", Type: "output", OutputPointer: "/steps/model"},
	}
	if err := service.validateSteps(steps, 0); err == nil {
		t.Fatal("workflow without a fixed Agent must be rejected")
	}
}

func TestScheduledNextUsesShanghaiTimezone(t *testing.T) {
	from := time.Date(2026, 8, 1, 0, 30, 0, 0, time.UTC)
	next, err := scheduledNext("0 9 * * *", "Asia/Shanghai", from)
	if err != nil {
		t.Fatal(err)
	}
	if next.Location().String() != "Asia/Shanghai" || next.Hour() != 9 || next.Day() != 1 {
		t.Fatalf("unexpected next run: %s (%s)", next, next.Location())
	}
}
