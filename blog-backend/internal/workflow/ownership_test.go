package workflow

import (
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkflowProductionCodeDoesNotQueryAgentOwnedMediaCandidates(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if bytes.Contains(data, []byte("ai_media_candidates")) {
			t.Errorf("%s queries Agent-owned ai_media_candidates directly", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestWorkflowServiceDoesNotOwnRawTransactions(t *testing.T) {
	data, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte(".BeginTx(")) {
		t.Fatal("Workflow Service must delegate transaction ownership to application coordinators")
	}
}
