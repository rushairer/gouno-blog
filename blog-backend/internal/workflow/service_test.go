package workflow

import (
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

func TestValidateStepsRejectsToolAndUnboundedLoop(t *testing.T) {
	service := &Service{}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "one", Type: "tool"}}, 0); err == nil {
		t.Fatal("Workflow must not execute Tools directly")
	}
	if err := service.validateSteps([]domain.WorkflowStep{{ID: "loop", Type: "for_each", CollectionPointer: "/items", MaxItems: 101}}, 0); err == nil {
		t.Fatal("unbounded loop should be rejected")
	}
}

func TestValidatePortableWorkflow(t *testing.T) {
	service := &Service{}
	steps := []domain.WorkflowStep{
		{ID: "model", Type: "model", AgentIDPointer: "/input/agent_id"},
		{ID: "approval", Type: "approval_gate"},
		{ID: "result", Type: "output", OutputPointer: "/steps/model"},
	}
	if err := service.validateSteps(steps, 0); err != nil {
		t.Fatalf("valid workflow rejected: %v", err)
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
