package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
	"github.com/rushairer/blog-backend/internal/workflow/readmodel"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

func TestWorkflowRunReadModelPreservesAdminProjectionSemantics(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	marker := fmt.Sprintf("read-model-%d", time.Now().UnixNano())
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,output,trigger_kind,source_ref)
		VALUES($1,$2,'succeeded','{}','{"ok":true}','manual',$3) RETURNING id`, workflowID, versionID, marker).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,status,input,output,started_at,finished_at)
		VALUES($1,'read-step','output','succeeded','{}','{"step":true}',NOW(),NOW())`, runID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
		VALUES($1,'post',$2,'manual','target','read snapshot','v1','{}')`, runID, marker); err != nil {
		t.Fatal(err)
	}

	svc := &Service{runReads: workflowrepository.NewRunReadRepository(db)}
	runs, err := svc.ListRuns(ctx, workflowID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, run := range runs {
		if run.ID == runID {
			found = true
			var output map[string]bool
			if err := json.Unmarshal(run.Output, &output); err != nil || !output["ok"] {
				t.Fatalf("run output=%s err=%v", run.Output, err)
			}
		}
	}
	if !found {
		t.Fatalf("run %d missing from workflow projection", runID)
	}
	steps, err := svc.RunSteps(ctx, runID)
	if err != nil || len(steps) != 1 || steps[0].StepID != "read-step" {
		t.Fatalf("steps=%#v err=%v", steps, err)
	}
	var stepOutput map[string]bool
	if err := json.Unmarshal(steps[0].Output, &stepOutput); err != nil || !stepOutput["step"] {
		t.Fatalf("step output=%s err=%v", steps[0].Output, err)
	}
	resources, err := svc.ListResources(ctx, runID)
	if err != nil || len(resources) != 1 || resources[0].ResourceKey != marker || resources[0].AccessLevel != "target" {
		t.Fatalf("resources=%#v err=%v", resources, err)
	}
	var missingID int64
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(MAX(id),0)+1000000 FROM ai_workflow_runs`).Scan(&missingID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RunSteps(ctx, missingID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing run error=%v", err)
	}
}

func TestWorkflowMetricsReadModelPreservesAggregateSemantics(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	repo := workflowrepository.NewMetricsRepository(db)
	baseline, err := repo.ListWorkflowMetrics(ctx)
	if err != nil {
		t.Fatal(err)
	}
	before := readmodel.Metric{WorkflowID: workflowID}
	for _, row := range baseline {
		if row.WorkflowID == workflowID {
			before = row
			break
		}
	}
	marker := fmt.Sprintf("metrics-read-model-%d", time.Now().UnixNano())
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,input_tokens,output_tokens,trigger_kind,source_ref,finished_at)
		VALUES($1,$2,'failed','{}',5,7,'manual',$3,NOW()) RETURNING id`, workflowID, versionID, marker).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })

	svc := &Service{metrics: repo}
	payload, err := svc.Metrics(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rows, ok := payload["workflows"].([]map[string]any)
	if !ok {
		t.Fatalf("metrics payload type=%T", payload["workflows"])
	}
	found := false
	for _, row := range rows {
		id, _ := row["workflow_id"].(int64)
		if id != workflowID {
			continue
		}
		found = true
		if row["runs"].(int64) != before.Runs+1 || row["failures"].(int64) != before.Failures+1 || row["tokens"].(int64) != before.Tokens+12 {
			t.Fatalf("metrics row=%#v baseline=%#v", row, before)
		}
	}
	if !found {
		t.Fatalf("workflow %d missing from metrics", workflowID)
	}
}

func TestDefinitionRepositoryOwnsExecutionDefinitionReads(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	repo := workflowrepository.NewDefinitionRepository(db)
	steps, err := repo.VersionStepsByID(ctx, versionID)
	if err != nil || len(steps) == 0 {
		t.Fatalf("version steps=%s err=%v", steps, err)
	}
	policy, err := repo.ResourceQueryEmptyPolicy(ctx, workflowID)
	if err != nil || (policy != "succeed" && policy != "fail") {
		t.Fatalf("resource query empty policy=%q err=%v", policy, err)
	}
}
