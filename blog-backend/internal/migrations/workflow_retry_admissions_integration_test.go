package migrations

import (
	"context"
	"testing"
)

func TestWorkflowRetryAdmissionUpgradePreservesExistingSelections(t *testing.T) {
	db := isolatedIdentityDB(t)
	through(t, db, "100_text_dispatch_decode_evidence.sql", false)
	ctx := context.Background()
	var sourceID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind)
		SELECT workflow_id,id,'succeeded','manual' FROM ai_workflow_versions ORDER BY id LIMIT 1 RETURNING id`).Scan(&sourceID); err != nil {
		t.Fatal(err)
	}
	const insert = `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind,retry_of_run_id,retry_step_id,retry_iterations)
		SELECT workflow_id,workflow_version_id,'succeeded','retry',id,'batch',$2::jsonb FROM ai_workflow_runs WHERE id=$1`
	execIdentity(t, db, insert, sourceID, "[1,2]")
	execIdentity(t, db, insert, sourceID, "[2,3]")
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if count := countIdentity(t, db, `SELECT count(*) FROM ai_workflow_retry_admissions WHERE source_run_id=$1`, sourceID); count != 3 {
		t.Fatalf("backfilled %d indices, want 3", count)
	}
	execIdentity(t, db, `DELETE FROM ai_workflow_runs WHERE retry_of_run_id=$1`, sourceID)
	if _, err := db.ExecContext(ctx, insert, sourceID, "[3,4]"); err == nil {
		t.Fatal("overlapping direct insertion accepted after retry deletion")
	}
	if count := countIdentity(t, db, `SELECT count(*) FROM ai_workflow_retry_admissions WHERE source_run_id=$1`, sourceID); count != 3 {
		t.Fatalf("rejected insertion changed evidence: %d", count)
	}
	execIdentity(t, db, insert, sourceID, "[4]")
	if count := countIdentity(t, db, `SELECT count(*) FROM ai_workflow_retry_admissions WHERE source_run_id=$1`, sourceID); count != 4 {
		t.Fatalf("disjoint admission not recorded: %d", count)
	}
}
