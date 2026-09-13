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

func TestWorkflowServiceDoesNotOwnDispatchOrExecutionPersistence(t *testing.T) {
	data, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatal(err)
	}
	forbidden := []string{
		"INSERT INTO ai_workflow_events",
		"UPDATE ai_workflow_events",
		"UPDATE ai_workflows SET next_run_at",
		"UPDATE ai_workflow_runs SET status=",
		"INSERT INTO ai_workflow_step_runs",
		"INSERT INTO workflow_interaction_tasks",
		"INSERT INTO workflow_run_events",
		"INSERT INTO ai_workflow_run_resources",
		"FROM ai_approvals",
	}
	for _, fragment := range forbidden {
		if bytes.Contains(data, []byte(fragment)) {
			t.Errorf("Workflow Service still owns persistence fragment %q", fragment)
		}
	}
}
