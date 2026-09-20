package router

import (
	"os"
	"strings"
	"testing"
)

func TestRouterUsesCapabilityOwnedAIControllers(t *testing.T) {
	data, err := os.ReadFile("web.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, required := range []string{
		"*agentcontroller.Controller",
		"agentCtrl.ListProviders",
		"agentCtrl.ListAgents",
		"agentCtrl.ListSkills",
		"agentCtrl.ListApprovals",
		"agentCtrl.ListMediaCandidates",
		"*knowledgecontroller.Controller",
		"knowledgeCtrl.ListEmbeddingProfiles",
		"knowledgeCtrl.ListIndexContent",
		"knowledgeCtrl.SearchIndex",
		"*connectorcontroller.Controller",
		"connectorCtrl.ListConnectorProfiles",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("router missing capability ownership contract %q", required)
		}
	}
	for _, forbidden := range []string{
		"LegacyAICtrl",
		"legacyAICtrl",
		"controller.AgentController",
		"connectorCtrl.ListProviders",
		"connectorCtrl.ListAgents",
		"connectorCtrl.ListSkills",
		"connectorCtrl.ListApprovals",
		"connectorCtrl.ListMediaCandidates",
		"agentCtrl.ListEmbeddingProfiles",
		"connectorCtrl.ListEmbeddingProfiles",
		"knowledgeCtrl.ListConnectorProfiles",
		"agentCtrl.ListConnectorProfiles",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("router crossed AI capability ownership boundary: %q", forbidden)
		}
	}
}
