package repository

import "testing"

func TestProviderStarterDefinitionsAreCompleteAndRunnable(t *testing.T) {
	definitions := providerStarterWorkflows()
	if len(definitions) != 12 {
		t.Fatalf("provider-dependent starter count = %d, want 12", len(definitions))
	}
	seen := map[string]bool{}
	for _, definition := range definitions {
		if definition.key == "" || seen[definition.key] {
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

func TestStepsHaveFixedAgentsRejectsNestedMissingBinding(t *testing.T) {
	steps := batchSteps("/input/post_ids", 20, 0, true)
	if stepsHaveFixedAgents(steps) {
		t.Fatal("nested model without agent_id must be rejected")
	}
}
