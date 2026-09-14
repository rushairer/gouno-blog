package dbtx_test

import (
	"os"
	"sort"
	"testing"
)

func TestLegacyFlatRepositoryBucketIsFrozen(t *testing.T) {
	allowed := map[string]string{
		"transaction.go": "Connector-held transaction compatibility facade",
	}

	entries, err := os.ReadDir("../repository")
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
		t.Fatalf("legacy internal/repository bucket gained unclassified entries: %v", unexpected)
	}
	for name, classification := range allowed {
		if !seen[name] {
			t.Errorf("classified flat repository entry %s (%s) disappeared without updating the ownership map", name, classification)
		}
	}
}
