package controllerutil_test

import (
	"os"
	"sort"
	"testing"
)

func TestLegacyFlatControllerBucketIsFrozen(t *testing.T) {
	allowed := map[string]string{
		"access_controller.go":          "stable Access security boundary",
		"agent_controller.go":           "Connector-held transitional shell",
		"agent_connector_controller.go": "Connector-held transport",
		"response.go":                   "minimal Access/Connector-held response facade",
	}

	entries, err := os.ReadDir("../controller")
	if err != nil {
		t.Fatal(err)
	}
	unexpected := make([]string, 0)
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		seen[name] = true
		if _, ok := allowed[name]; !ok {
			unexpected = append(unexpected, name)
		}
	}
	sort.Strings(unexpected)
	if len(unexpected) != 0 {
		t.Fatalf("legacy internal/controller bucket gained unclassified entries: %v", unexpected)
	}
	for name, classification := range allowed {
		if !seen[name] {
			t.Errorf("classified flat controller entry %s (%s) disappeared without updating the ownership map", name, classification)
		}
	}
}
