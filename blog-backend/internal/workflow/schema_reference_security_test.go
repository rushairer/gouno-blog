package workflow

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestWorkflowSchemasKeepLocalFragmentReferences(t *testing.T) {
	schema := json.RawMessage(`{
		"$schema":"https://json-schema.org/draft/2020-12/schema",
		"type":"object",
		"$defs":{"title":{"type":"string","minLength":1}},
		"properties":{"title":{"$ref":"#/$defs/title"}}
	}`)
	if err := validateInputSchema(schema); err != nil {
		t.Fatalf("in-document ref must remain valid for authored schema: %v", err)
	}
	if err := validateWorkflowInput(schema, map[string]any{"title": "a valid title"}); err != nil {
		t.Fatalf("in-document ref must remain valid for input validation: %v", err)
	}
	if err := validateWorkflowInput(schema, map[string]any{"title": ""}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("local referenced constraint must be enforced, got %v", err)
	}
}

func TestWorkflowSchemasNeverLoadExternalFileReferences(t *testing.T) {
	// A readable, valid external schema would compile with the default
	// jsonschema/v5 file loader. Assert that all entrypoints reject it.
	path := filepath.Join(t.TempDir(), "external-schema.json")
	if err := os.WriteFile(path, []byte(`{"type":"string"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	fileURL := (&url.URL{Scheme: "file", Path: path}).String()
	schema := json.RawMessage(fmt.Sprintf(
		`{"type":"object","properties":{"title":{"$ref":%q}}}`, fileURL,
	))
	for _, tc := range []struct {
		name string
		check func(json.RawMessage) error
	}{
		{name: "authoring", check: validateInputSchema},
		{name: "execution", check: func(raw json.RawMessage) error {
			return validateWorkflowInput(raw, map[string]any{"title": "external schema value"})
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.check(schema); !errors.Is(err, ErrInvalid) {
				t.Fatalf("external file reference was not rejected as invalid: %v", err)
			}
		})
	}
}
