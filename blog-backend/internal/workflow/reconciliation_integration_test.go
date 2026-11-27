package workflow

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"
)

type reconciliationCandidate struct {
	id, workflowID, versionID	int64
	startedAt	sql.NullTime
	createdAt	time.Time
	retryOf sql.NullInt64
	input, output, checkpoints, children, active, pending, owned	int64
}

func readReconciliationCandidates(t *testing.T, db *sql.DB) map[int64]reconciliationCandidate {
	t.Helper()
	query, err := os.ReadFile("../../../scripts/workflow-reconciliation.sql")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, string(query))
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	want := []string{"id", "workflow_id", "workflow_version_id", "started_at", "created_at",
		"retry_of_run_id", "input_tokens", "output_tokens", "checkpoint_count", "child_agent_count",
		"active_child_count", "pending_interaction_count", "owned_retry_indices"}
	if err != nil || !reflect.DeepEqual(columns, want) {
		t.Fatalf("metadata-only projection: columns=%v err=%v", columns, err)
	}
	items := make(map[int64]reconciliationCandidate)
	for rows.Next() {
		var c reconciliationCandidate
		if err := rows.Scan(&c.id, &c.workflowID, &c.versionID, &c.startedAt, &c.createdAt,
			&c.retryOf, &c.input, &c.output, &c.checkpoints, &c.children, &c.active, &c.pending, &c.owned); err != nil {
			t.Fatal(err)
		}
		items[c.id] = c
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return items
}

func TestWorkflowReconciliationReadOnlyCandidates(t *testing.T) {
	f := newLifecycleFixture(t, "running")
	db := f.db
	workflowID, versionID := admissionWorkflowVersion(t, db)
	marker := fmt.Sprintf("reconciliation-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_workflow_runs WHERE source_ref=$1`, marker); err != nil {
			t.Error(err)
		}
	})
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	insert := func(status string, startedAt any) int64 {
		t.Helper()
		var id int64
		if err := db.QueryRow(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind,source_ref,started_at)
			VALUES($1,$2,$3,'manual',$4,$5) RETURNING id`, workflowID, versionID, status, marker, startedAt).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	old := time.Now().Add(-time.Hour)
	exec(`UPDATE ai_workflow_runs SET started_at=$2,input_tokens=17,output_tokens=23,input='{"private":"not for reports"}' WHERE id=$1`, f.run, old)
	exec(`INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status,output)
		VALUES($1,'result','output',-1,'succeeded','{"private":"not for reports"}')`, f.run)
	missingStart := insert("running", nil)
	fresh := insert("running", time.Now())
	queued := insert("queued", old)
	waiting := insert("waiting_for_user", old)
	approval := insert("awaiting_approval", old)
	failed := insert("failed", old)
	cancelled := insert("cancelled", old)
	source := insert("succeeded", old)
	var retryID int64
	if err := db.QueryRow(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind,source_ref,started_at,retry_of_run_id,retry_step_id,retry_iterations)
		VALUES($1,$2,'running','retry',$3,$4,$5,'batch','[0,1]') RETURNING id`,
		workflowID, versionID, marker, old, source).Scan(&retryID); err != nil {
		t.Fatal(err)
	}
	items := readReconciliationCandidates(t, db)
	c, ok := items[f.run]
	if !ok || c.input != 17 || c.output != 23 || c.checkpoints != 1 || c.children != 1 || c.active != 0 || c.pending != 1 || c.owned != 0 {
		t.Fatalf("unexpected retained evidence: %#v found=%v", c, ok)
	}
	if c, ok := items[missingStart]; !ok || c.startedAt.Valid {
		t.Fatalf("missing claim timestamp omitted: %#v found=%v", c, ok)
	}
	if c, ok := items[retryID]; !ok || !c.retryOf.Valid || c.retryOf.Int64 != source || c.owned != 2 {
		t.Fatalf("retry ownership evidence: %#v found=%v", c, ok)
	}
	for _, id := range []int64{fresh, queued, waiting, approval, failed, cancelled, source} {
		if _, ok := items[id]; ok {
			t.Fatalf("non-candidate run %d included", id)
		}
	}
	f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "running", f.run)
	f.state(t, `SELECT status FROM workflow_interaction_tasks WHERE id=$1`, "pending", f.interaction)
	f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "running", retryID)

	// A larger backlog is intentionally bounded. No automatic mutation drains it.
	exec(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,trigger_kind,source_ref,started_at)
		SELECT $1,$2,'running','manual',$3,$4 FROM generate_series(1,101)`, workflowID, versionID, marker, old)
	if got := len(readReconciliationCandidates(t, db)); got != 100 {
		t.Fatalf("candidate limit: %d", got)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_workflow_runs WHERE source_ref=$1 AND status='running'`, marker).Scan(&count); err != nil || count != 104 {
		t.Fatalf("read-only backlog count=%d err=%v", count, err)
	}
}
