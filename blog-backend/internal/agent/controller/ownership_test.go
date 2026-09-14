package controller

import (
	"os"
	"strings"
	"testing"
)

func TestAgentControllerIsCapabilityOwned(t *testing.T) {
	data, err := os.ReadFile("controller.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{"internal/knowledge", "internal/connector", "*knowledge.Service", "*connector.Service"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("Agent controller must not own deferred Knowledge/Connector transport: %s", forbidden)
		}
	}
	if !strings.Contains(text, "type WorkflowLifecyclePort interface") {
		t.Fatal("Agent media/approval coordination must retain the narrow Workflow lifecycle port")
	}
}

func TestRetiredFlatControllerIsAbsent(t *testing.T) {
	if _, err := os.Stat("../../controller"); !os.IsNotExist(err) {
		t.Fatalf("retired flat controller bucket exists: %v", err)
	}
}

func TestAgentControllerDoesNotOwnWorkflowHTTP(t *testing.T) {
	data, err := os.ReadFile("generation.go")
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

func TestAgentControllerUsesNarrowWorkflowPort(t *testing.T) {
	data, err := os.ReadFile("controller.go")
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
