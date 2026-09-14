package workflow

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/dbtx"

	"github.com/rushairer/blog-backend/internal/testsupport"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

func newTestRunAdmissionCoordinator(db *sql.DB) *RunAdmissionCoordinator {
	return NewRunAdmissionCoordinator(dbtx.NewTransactor(db, nil), workflowrepository.NewRunAdmissionRepository(db))
}

func admissionWorkflowVersion(t *testing.T, db *sql.DB) (int64, int64) {
	t.Helper()
	var workflowID, versionID int64
	if err := db.QueryRow(`SELECT workflow_id,id FROM ai_workflow_versions ORDER BY id LIMIT 1`).Scan(&workflowID, &versionID); err != nil {
		t.Fatal(err)
	}
	return workflowID, versionID
}

func TestRunAdmissionCommitsRunAndInitialResourcesAtomically(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	marker := fmt.Sprintf("admission-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM ai_workflow_runs WHERE source_ref=$1`, marker) })

	run := &workflowdomain.WorkflowRun{WorkflowID: workflowID, WorkflowVersionID: versionID, Status: "queued", Input: []byte(`{}`), TriggerKind: "manual", SourceRef: marker}
	resource := workflowdomain.WorkflowResource{ResourceType: "post", ResourceKey: marker, Source: "manual", AccessLevel: "target", Label: "snapshot", VersionToken: "v1", Snapshot: []byte(`{"label":"snapshot"}`)}
	admitted, err := newTestRunAdmissionCoordinator(db).Admit(ctx, run, []workflowdomain.WorkflowResource{resource}, false)
	if err != nil {
		t.Fatal(err)
	}
	var status string
	var resources int
	if err := db.QueryRow(`SELECT status FROM ai_workflow_runs WHERE id=$1`, admitted.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND source='manual'`, admitted.ID).Scan(&resources); err != nil {
		t.Fatal(err)
	}
	if status != "queued" || resources != 1 {
		t.Fatalf("admission state status=%q resources=%d", status, resources)
	}
}

var errAdmissionInjected = errors.New("injected admission persistence failure")

type failingAdmissionResources struct{ RunAdmissionStore }

func (s failingAdmissionResources) InsertAdmissionResourcesTx(ctx context.Context, tx *sql.Tx, runID int64, resources []workflowdomain.WorkflowResource) error {
	if err := s.RunAdmissionStore.InsertAdmissionResourcesTx(ctx, tx, runID, resources); err != nil {
		return err
	}
	return errAdmissionInjected
}

func TestRunAdmissionRollsBackRunWhenResourcePersistenceFails(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	marker := fmt.Sprintf("admission-rollback-%d", time.Now().UnixNano())
	base := workflowrepository.NewRunAdmissionRepository(db)
	coordinator := NewRunAdmissionCoordinator(dbtx.NewTransactor(db, nil), failingAdmissionResources{base})
	run := &workflowdomain.WorkflowRun{WorkflowID: workflowID, WorkflowVersionID: versionID, Status: "queued", Input: []byte(`{}`), TriggerKind: "manual", SourceRef: marker}
	resource := workflowdomain.WorkflowResource{ResourceType: "post", ResourceKey: marker, Source: "manual", AccessLevel: "target", Label: "snapshot", VersionToken: "v1", Snapshot: []byte(`{}`)}
	if _, err := coordinator.Admit(ctx, run, []workflowdomain.WorkflowResource{resource}, false); !errors.Is(err, errAdmissionInjected) {
		t.Fatalf("admit error=%v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_workflow_runs WHERE source_ref=$1`, marker).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("rolled-back admission left %d run rows", count)
	}
}

type failingRetryCopy struct{ RunAdmissionStore }

func (s failingRetryCopy) CopyRetryQueryStepsTx(ctx context.Context, tx *sql.Tx, sourceRunID, retryRunID int64) error {
	if err := s.RunAdmissionStore.CopyRetryQueryStepsTx(ctx, tx, sourceRunID, retryRunID); err != nil {
		return err
	}
	return errAdmissionInjected
}

func TestRunRetrySnapshotRollsBackAsOneTransaction(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var sourceRunID int64
	if err := db.QueryRow(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind) VALUES($1,$2,'succeeded','{}','manual') RETURNING id`, workflowID, versionID).Scan(&sourceRunID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1 OR retry_of_run_id=$1`, sourceRunID) })
	if _, err := db.Exec(`INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status) VALUES($1,'child','output',1,'failed')`, sourceRunID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ai_workflow_run_resources(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot) VALUES($1,'post','1','manual','target','snapshot','v1','{}')`, sourceRunID); err != nil {
		t.Fatal(err)
	}
	base := workflowrepository.NewRunAdmissionRepository(db)
	coordinator := NewRunAdmissionCoordinator(dbtx.NewTransactor(db, nil), failingRetryCopy{base})
	if _, err := coordinator.Retry(ctx, sourceRunID, "child", "batch", []int{1}, nil); !errors.Is(err, errAdmissionInjected) {
		t.Fatalf("retry error=%v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_workflow_runs WHERE retry_of_run_id=$1`, sourceRunID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("rolled-back retry left %d retry rows", count)
	}
}

func TestRunAdmissionRecoveryRequeuesInterruptedRuns(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	marker := fmt.Sprintf("recovery-%d", time.Now().UnixNano())
	var runID int64
	if err := db.QueryRow(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind,source_ref,error_code,error_message,started_at,finished_at) VALUES($1,$2,'running','{}','manual',$3,'old','old',NOW(),NOW()) RETURNING id`, workflowID, versionID, marker).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })
	coordinator := newTestRunAdmissionCoordinator(db)
	if err := coordinator.RecoverInterrupted(ctx); err != nil {
		t.Fatal(err)
	}
	var status string
	var errorCode, errorMessage sql.NullString
	var startedAt, finishedAt sql.NullTime
	if err := db.QueryRow(`SELECT status,error_code,error_message,started_at,finished_at FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status, &errorCode, &errorMessage, &startedAt, &finishedAt); err != nil {
		t.Fatal(err)
	}
	if status != "queued" || errorCode.Valid || errorMessage.Valid || startedAt.Valid || finishedAt.Valid {
		t.Fatalf("recovered state status=%q code=%v message=%v started=%v finished=%v", status, errorCode, errorMessage, startedAt, finishedAt)
	}
	ids, err := coordinator.QueuedRunIDs(ctx, 10000)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, id := range ids {
		if id == runID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("recovered run %d missing from queued run list", runID)
	}
}
