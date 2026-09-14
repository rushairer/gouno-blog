package controller

import (
	"os"
	"strings"
	"testing"
)

func TestFlatAgentControllerDoesNotOwnWorkflowHTTP(t *testing.T) {
	data, err := os.ReadFile("../agent/controller/generation.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{
		"func (ctrl *AgentController) DraftWorkflow(",
		"func (ctrl *AgentController) ListWorkflows(",
		"func (ctrl *AgentController) ReceiveWorkflowWebhook(",
		"func (ctrl *AgentController) ListWorkflowRuns(",
		"func (ctrl *AgentController) ResolveInteraction(",
		"func (ctrl *AgentController) WorkflowMetrics(",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("Agent capability controller still owns Workflow HTTP handler %q", forbidden)
		}
	}
}

func TestFlatAgentControllerUsesNarrowWorkflowPort(t *testing.T) {
	data, err := os.ReadFile("../agent/controller/controller.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if strings.Contains(text, "*workflowservice.Service") {
		t.Fatal("Agent capability controller still depends on the full Workflow service")
	}
	if !strings.Contains(text, "type WorkflowLifecyclePort interface") {
		t.Fatal("narrow Workflow lifecycle port is missing")
	}
}
