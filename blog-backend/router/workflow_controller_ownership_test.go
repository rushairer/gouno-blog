package router

import (
	"os"
	"strings"
	"testing"
)

func TestWorkflowHTTPRoutesUseCapabilityController(t *testing.T) {
	data, err := os.ReadFile("web.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{
		"agentCtrl.ReceiveWorkflowWebhook",
		"agentCtrl.DraftWorkflow)",
		"agentCtrl.ListWorkflows",
		"agentCtrl.ListWorkflowRuns",
		"agentCtrl.ResolveInteraction",
		"agentCtrl.WorkflowMetrics",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("Workflow route still bound to flat Agent controller: %s", forbidden)
		}
	}
	for _, required := range []string{
		"WorkflowCtrl       *workflowcontroller.Controller",
		"workflowCtrl.ReceiveWorkflowWebhook",
		"workflowCtrl.ListWorkflows",
		"workflowCtrl.ListWorkflowRuns",
		"workflowCtrl.ResolveInteraction",
		"workflowCtrl.WorkflowMetrics",
	} {
		if !strings.Contains(text, required) {
			t.Errorf("canonical Workflow route binding missing: %s", required)
		}
	}
}
