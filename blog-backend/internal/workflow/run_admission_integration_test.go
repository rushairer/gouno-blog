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
	admitted, err := newTestRunAdmissionCoordinator(db).Admit(ctx, run, []workflowdomain.WorkflowResource{resource})
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
	if _, err := coordinator.Admit(ctx, run, []workflowdomain.WorkflowResource{resource}); !errors.Is(err, errAdmissionInjected) {
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
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_workflow_retry_admissions WHERE source_run_id=$1`, sourceRunID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rolled-back retry left admission evidence: count=%d err=%v", count, err)
	}
	if _, err := newTestRunAdmissionCoordinator(db).Retry(ctx, sourceRunID, "child", "batch", []int{1}, nil); err != nil {
		t.Fatalf("confirmed rollback must not consume the iteration: %v", err)
	}
}

func TestRunAdmissionRecoveryPreservesClaimedRuns(t *testing.T) {
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
	queuedID := newExecutionFenceRun(t, db)
	var status string
	var errorCode, errorMessage sql.NullString
	var startedAt, finishedAt sql.NullTime
	if err := db.QueryRow(`SELECT status,error_code,error_message,started_at,finished_at FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status, &errorCode, &errorMessage, &startedAt, &finishedAt); err != nil {
		t.Fatal(err)
	}
	if status != "running" || errorCode.String != "old" || errorMessage.String != "old" || !startedAt.Valid || !finishedAt.Valid {
		t.Fatalf("recovered state status=%q code=%v message=%v started=%v finished=%v", status, errorCode, errorMessage, startedAt, finishedAt)
	}
	ids, err := coordinator.QueuedRunIDs(ctx, 10000)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, id := range ids {
		if id == runID {
			t.Fatalf("claimed run %d was exposed for automatic recovery", runID)
		}
		if id == queuedID {
			found = true
		}
	}
	if !found {
		t.Fatalf("queued run %d missing from queued run list", queuedID)
	}
}

func TestRunRetryAdmissionSerializesActiveRetries(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var sourceRunID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind)
		VALUES($1,$2,'succeeded','{}','manual') RETURNING id`, workflowID, versionID).Scan(&sourceRunID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1 OR retry_of_run_id=$1`, sourceRunID); err != nil {
			t.Error(err)
		}
	})
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status)
		VALUES($1,'child','output',1,'failed'),($1,'child','output',2,'failed')`, sourceRunID); err != nil {
		t.Fatal(err)
	}
	type result struct {
		run *workflowdomain.WorkflowRun
		err error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for _, iteration := range []int{1, 2} {
		go func(iteration int) {
			<-start
			run, err := newTestRunAdmissionCoordinator(db).Retry(ctx, sourceRunID, "child", "batch", []int{iteration}, nil)
			results <- result{run, err}
		}(iteration)
	}
	close(start)
	var admittedID int64
	denied := 0
	for range 2 {
		got := <-results
		if got.err == nil && got.run != nil && got.run.ID > 0 {
			admittedID = got.run.ID
		} else if errors.Is(got.err, ErrInvalid) && got.run == nil {
			denied++
		} else {
			t.Fatalf("unexpected retry admission: run=%v err=%v", got.run, got.err)
		}
	}
	if admittedID == 0 || denied != 1 {
		t.Fatalf("expected one admitted and one denied, id=%d denied=%d", admittedID, denied)
	}
	coordinator := newTestRunAdmissionCoordinator(db)
	for _, status := range []string{"queued", "running", "waiting_for_user", "awaiting_approval"} {
		if _, err := db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2 WHERE id=$1`, admittedID, status); err != nil {
			t.Fatal(err)
		}
		if run, err := coordinator.Retry(ctx, sourceRunID, "child", "batch", []int{1, 2}, nil); run != nil || !errors.Is(err, ErrInvalid) {
			t.Fatalf("active retry status=%s allowed another run: run=%v err=%v", status, run, err)
		}
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_runs WHERE retry_of_run_id=$1`, sourceRunID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected one retry row, got %d", count)
	}
}

func TestRunRetryAdmissionRetainsConsumedIterationsAfterDeletion(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var sourceID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind)
		VALUES($1,$2,'succeeded','{}','manual') RETURNING id`, workflowID, versionID).Scan(&sourceID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1 OR retry_of_run_id=$1`, sourceID); err != nil {
			t.Error(err)
		}
	})
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status)
		VALUES($1,'child','output',1,'failed'),($1,'child','output',2,'failed')`, sourceID); err != nil {
		t.Fatal(err)
	}
	coordinator := newTestRunAdmissionCoordinator(db)
	first, err := coordinator.Retry(ctx, sourceID, "child", "batch", []int{1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='succeeded' WHERE id=$1`, first.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status)
		VALUES($1,'child','output',1,'failed')`, first.ID); err != nil {
		t.Fatal(err)
	}
	if run, err := coordinator.Retry(ctx, first.ID, "child", "batch", []int{1}, nil); run != nil || !errors.Is(err, ErrInvalid) {
		t.Fatalf("descendant replay accepted: run=%v err=%v", run, err)
	}
	for _, deleted := range []bool{false, true} {
		if deleted {
			if _, err := db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, first.ID); err != nil {
				t.Fatal(err)
			}
		}
		if run, err := coordinator.Retry(ctx, sourceID, "child", "batch", []int{1, 2}, nil); run != nil || !errors.Is(err, ErrInvalid) {
			t.Fatalf("overlap after deletion=%v: run=%v err=%v", deleted, run, err)
		}
	}
	if _, err := coordinator.Retry(ctx, sourceID, "child", "batch", []int{2}, nil); err != nil {
		t.Fatalf("disjoint iteration was not consumed: %v", err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM ai_workflow_retry_admissions WHERE source_run_id=$1`, sourceID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("admission ledger count=%d err=%v", count, err)
	}
}

func TestExecutionRetryClaimRequiresExactAdmissionOwner(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var sourceID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind)
		VALUES($1,$2,'succeeded','manual') RETURNING id`, workflowID, versionID).Scan(&sourceID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1 OR retry_of_run_id=$1`, sourceID); err != nil {
			t.Error(err)
		}
	})
	const insert = `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind,retry_of_run_id,retry_step_id,retry_iterations)
		VALUES($1,$2,'queued','retry',$3,'batch',$4::jsonb) RETURNING id`
	execution := newTestExecutionCoordinator(db)
	for _, tc := range []struct {
		selection string
		change    string
	}{
		{"[0]", ""},
		{"[1]", "UPDATE ai_workflow_retry_admissions SET retry_run_id=NULL WHERE retry_run_id=$1"},
		{"[2]", "UPDATE ai_workflow_retry_admissions SET retry_run_id=retry_run_id+1000000 WHERE retry_run_id=$1"},
		{"[3,4]", "UPDATE ai_workflow_runs SET retry_iterations='[3]' WHERE id=$1"},
		{"[5]", "UPDATE ai_workflow_runs SET retry_iterations='[5,5]' WHERE id=$1"},
	} {
		var retryID int64
		if err := db.QueryRowContext(ctx, insert, workflowID, versionID, sourceID, tc.selection).Scan(&retryID); err != nil {
			t.Fatal(err)
		}
		if tc.change == "" {
			if run, err := execution.ClaimRun(ctx, retryID); err != nil || run == nil || run.ID != retryID {
				t.Fatalf("valid retry claim: run=%v err=%v", run, err)
			}
			continue
		}
		if _, err := db.ExecContext(ctx, tc.change, retryID); err != nil {
			t.Fatal(err)
		}
		// No definitions or Agent dependency is wired: a denied claim must
		// stop the Service before it can execute any step.
		service := &Service{execution: execution}
		if err := service.execute(ctx, retryID); err == nil {
			t.Fatalf("unconfirmed retry owner accepted: %s", tc.selection)
		}
		assertExecutionFenceStatus(t, db, retryID, "running")
		var count int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_step_runs WHERE workflow_run_id=$1`, retryID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("denied retry recorded %d steps: %v", count, err)
		}
	}
}
