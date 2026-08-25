package controller

import (
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/workflowplan"
)

func TestExtractWorkflowDraftJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		ok    bool
	}{
		{name: "plain", input: `{"name":"draft","input_schema":{},"steps":[]}`, ok: true},
		{name: "code fence", input: "Here is the draft:\n```json\n{\"name\":\"draft\",\"input_schema\":{},\"steps\":[]}\n```", ok: true},
		{name: "braces in string", input: `prefix {"name":"{draft}","input_schema":{},"steps":[]} suffix`, ok: true},
		{name: "not json", input: "I cannot create a draft", ok: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, ok := workflowplan.ExtractWorkflowDraftJSON(test.input)
			if ok != test.ok {
				t.Fatalf("ok=%v, want %v", ok, test.ok)
			}
		})
	}
	if !strings.Contains(workflowplan.WorkflowPlannerPrompt, "workflow-intent/v2") || !strings.Contains(workflowplan.WorkflowPlannerCorrectionPrompt, "required capability") {
		t.Fatal("planner prompts must require typed intent and capability validation")
	}
}
