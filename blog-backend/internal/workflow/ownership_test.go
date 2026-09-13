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

func TestWorkflowServiceDoesNotOwnReadModelSQL(t *testing.T) {
	service, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(service, []byte("s.db.")) {
		t.Fatal("Workflow Service must not retain raw database access after read-model classification")
	}
	for _, fragment := range []string{"FROM ai_workflow_runs", "FROM ai_workflow_step_runs", "SELECT steps FROM ai_workflow_versions", "SELECT resource_query_empty_policy FROM ai_workflows"} {
		if bytes.Contains(service, []byte(fragment)) {
			t.Errorf("Workflow Service still owns read-model SQL fragment %q", fragment)
		}
	}
	resources, err := os.ReadFile("resources.go")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(resources, []byte("FROM ai_workflow_run_resources WHERE workflow_run_id")) {
		t.Fatal("Workflow Service resource listing must delegate to the Run read model")
	}
	ports, err := os.ReadFile("read_models.go")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(ports, []byte("internal/workflow/repository")) {
		t.Fatal("Workflow read-model ports must not depend on repository implementation types")
	}
}
