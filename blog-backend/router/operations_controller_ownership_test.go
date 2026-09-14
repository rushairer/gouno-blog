package router

import (
	"os"
	"strings"
	"testing"
)

func TestOperationsHTTPRoutesUseCapabilityController(t *testing.T) {
	data, err := os.ReadFile("web.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{
		"agentCtrl.ListSuggestions",
		"agentCtrl.RefreshSuggestions",
		"agentCtrl.ListEditorialTasks",
		"agentCtrl.ListCandidateSets",
		"agentCtrl.SelectCandidate",
		"agentCtrl.SaveFeedback",
		"agentCtrl.OutcomeMetrics",
	} {
		if strings.Contains(text, forbidden) {
			t.Errorf("Operations route still bound to flat Agent controller: %s", forbidden)
		}
	}
	for _, required := range []string{
		"OperationsCtrl     *operationscontroller.Controller",
		"operationsCtrl.ListSuggestions",
		"operationsCtrl.RefreshSuggestions",
		"operationsCtrl.ListEditorialTasks",
		"operationsCtrl.ListCandidateSets",
		"operationsCtrl.SelectCandidate",
		"operationsCtrl.SaveFeedback",
		"operationsCtrl.OutcomeMetrics",
		"agentCtrl.ListMediaCandidates",
		"agentCtrl.GenerateMediaCandidate",
		"agentCtrl.GenerateImage",
	} {
		if !strings.Contains(text, required) {
			t.Errorf("Operations/Agent ownership route binding missing: %s", required)
		}
	}
}
