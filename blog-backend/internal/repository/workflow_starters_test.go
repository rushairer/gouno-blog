package repository

import (
	"strings"
	"testing"
)

func TestProviderStarterDefinitionsAreCompleteAndRunnable(t *testing.T) {
	definitions := providerStarterWorkflows()
	if len(definitions) != 13 {
		t.Fatalf("provider-dependent starter count = %d, want 13", len(definitions))
	}
	seen := map[string]bool{}
	for _, definition := range definitions {
		if definition.key == "" || definition.agentKey == "" || seen[definition.key] {
			t.Fatalf("invalid or duplicate starter key %q", definition.key)
		}
		seen[definition.key] = true
		if !stepsHaveFixedAgents(definition.steps(42)) {
			t.Fatalf("starter %q has an unbound model step", definition.key)
		}
		if len(definition.inputSchema) == 0 || len(definition.scopePolicy) == 0 {
			t.Fatalf("starter %q is missing its version contract", definition.key)
		}
	}
}

func TestArticleImageGenerationStarterIsApprovalGatedImageBrief(t *testing.T) {
	for _, definition := range providerStarterWorkflows() {
		if definition.key != "selected_article_image_generation" {
			continue
		}
		if definition.agentKey != "content_distribution" {
			t.Fatalf("image generation starter must use the governed distribution Agent, got %q", definition.agentKey)
		}
		if !strings.Contains(string(definition.inputSchema), `"image_brief"`) {
			t.Fatal("image generation starter must constrain input to image_brief")
		}
		steps := definition.steps(42)
		if len(steps) != 3 || steps[1].Type != "approval_gate" {
			t.Fatal("image generation starter must wait for approval before creating a media candidate")
		}
		return
	}
	t.Fatal("image generation starter is missing")
}

func TestStepsHaveFixedAgentsRejectsNestedMissingBinding(t *testing.T) {
	steps := batchSteps("/input/post_ids", 20, 0, true)
	if stepsHaveFixedAgents(steps) {
		t.Fatal("nested model without agent_id must be rejected")
	}
}
