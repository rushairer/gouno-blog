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

func TestLegacyFlatControllerContainsNoAgentServices(t *testing.T) {
	data, err := os.ReadFile("../../controller/agent_controller.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{"ManagementService", "*agentservice.Runner", "ApprovalService", "GenerationService", "WorkflowLifecyclePort"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("legacy flat controller still owns Agent HTTP dependency: %s", forbidden)
		}
	}
}
