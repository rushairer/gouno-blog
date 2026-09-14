package router

import (
	"os"
	"strings"
	"testing"
)

func TestRouterUsesCapabilityAgentController(t *testing.T) {
	data, err := os.ReadFile("web.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, required := range []string{
		"AgentCtrl          *agentcontroller.Controller",
		"LegacyAICtrl",
		"*controller.AgentController",
		"agentCtrl.ListProviders",
		"agentCtrl.ListAgents",
		"agentCtrl.ListSkills",
		"agentCtrl.ListApprovals",
		"agentCtrl.ListMediaCandidates",
		"KnowledgeCtrl",
		"*knowledgecontroller.Controller",
		"knowledgeCtrl.ListEmbeddingProfiles",
		"legacyAICtrl.ListConnectorProfiles",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("router missing Agent ownership contract %q", required)
		}
	}
	for _, forbidden := range []string{
		"legacyAICtrl.ListProviders",
		"legacyAICtrl.ListAgents",
		"legacyAICtrl.ListSkills",
		"legacyAICtrl.ListApprovals",
		"legacyAICtrl.ListMediaCandidates",
		"agentCtrl.ListEmbeddingProfiles",
		"legacyAICtrl.ListEmbeddingProfiles",
		"knowledgeCtrl.ListConnectorProfiles",
		"agentCtrl.ListConnectorProfiles",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("router crossed Agent ownership boundary: %q", forbidden)
		}
	}
}
