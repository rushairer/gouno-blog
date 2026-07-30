package workflow

import (
	"encoding/json"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
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

func TestValidateStepsRejectsProposalToolAndUnboundedLoop(t *testing.T) {
	registry := tool.New(
		tool.Definition{Name: "read", Risk: domain.ToolRiskRead},
		tool.Definition{Name: "proposal", Risk: domain.ToolRiskPropose},
	)
	service := &Service{tools: registry}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "one", Type: "tool", ToolName: "proposal"}}, 0); err == nil {
		t.Fatal("proposal tool should require an Agent approval path")
	}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "loop", Type: "for_each", CollectionPointer: "/items", MaxItems: 101}}, 0); err == nil {
		t.Fatal("unbounded loop should be rejected")
	}
}

func TestValidatePortableWorkflow(t *testing.T) {
	registry := tool.New(tool.Definition{Name: "read", Risk: domain.ToolRiskRead})
	service := &Service{tools: registry}
	steps := []domain.WorkflowStep{
		{ID: "collect", Type: "tool", ToolName: "read", Arguments: json.RawMessage(`{}`)},
		{ID: "model", Type: "model", AgentIDPointer: "/input/agent_id"},
		{ID: "approval", Type: "approval_gate"},
		{ID: "result", Type: "output", OutputPointer: "/steps/model"},
	}
	if err := service.validateSteps(steps, 0); err != nil {
		t.Fatalf("valid workflow rejected: %v", err)
	}
}
