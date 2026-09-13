package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

func newTestDispatchCoordinator(db *sql.DB) *DispatchCoordinator {
	return NewDispatchCoordinator(dbtx.NewTransactor(db, nil), workflowrepository.NewDispatchRepository(db))
}

func newTestExecutionCoordinator(db *sql.DB) *ExecutionCoordinator {
	return NewExecutionCoordinator(
		dbtx.NewTransactor(db, nil),
		workflowrepository.NewExecutionRepository(db),
		workflowrepository.NewInteractionRepository(db),
	)
}

func newTestApprovalTargetReader(db *sql.DB) ExecutedApprovalTargetReader {
	return agentrepository.NewApprovalRepository(db)
}

func TestDispatchClaimsDueScheduleAndAdvancesNextRunAtomically(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	name := fmt.Sprintf("dispatch-schedule-%d", time.Now().UnixNano())
	var workflowID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflows(name,enabled,cron_expression,timezone,next_run_at,creation_origin)
        VALUES($1,TRUE,'* * * * *','UTC',NOW()-INTERVAL '1 minute','system') RETURNING id`, name).Scan(&workflowID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflows WHERE id=$1`, workflowID) })

	coordinator := newTestDispatchCoordinator(db)
	ids, err := coordinator.ClaimDueSchedules(ctx, 20)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, id := range ids {
		if id == workflowID {
			found = true
		}
	}
	if !found {
		t.Fatalf("due workflow %d was not claimed", workflowID)
	}
	var next time.Time
	if err := db.QueryRowContext(ctx, `SELECT next_run_at FROM ai_workflows WHERE id=$1`, workflowID).Scan(&next); err != nil {
		t.Fatal(err)
	}
	if !next.After(time.Now().Add(-time.Second)) {
		t.Fatalf("next_run_at was not advanced: %v", next)
	}
	ids, err = coordinator.ClaimDueSchedules(ctx, 20)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		if id == workflowID {
			t.Fatalf("workflow %d was claimed twice before the next schedule", workflowID)
		}
	}
}

func TestDispatchDueEventClaimUsesLease(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	key := fmt.Sprintf("dispatch-event-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_events WHERE event_key=$1`, key) })
	coordinator := newTestDispatchCoordinator(db)
	inserted, err := coordinator.AcceptEvent(ctx, key, "test.event", []byte(`{"ok":true}`))
	if err != nil || !inserted {
		t.Fatalf("accept event inserted=%v err=%v", inserted, err)
	}
	events, err := coordinator.ClaimDueEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, event := range events {
		if event.EventKey == key {
			found = true
		}
	}
	if !found {
		t.Fatalf("event %q was not claimed", key)
	}
	events, err = coordinator.ClaimDueEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.EventKey == key {
			t.Fatalf("event %q was claimed twice inside its lease", key)
		}
	}
}

func TestDispatchImmediatePrepareReservesEmitterLease(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	key := fmt.Sprintf("dispatch-immediate-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_events WHERE event_key=$1`, key) })
	coordinator := newTestDispatchCoordinator(db)
	inserted, err := coordinator.AcceptEvent(ctx, key, "test.immediate", []byte(`{"ok":true}`))
	if err != nil || !inserted {
		t.Fatalf("accept immediate event inserted=%v err=%v", inserted, err)
	}
	if err := coordinator.PrepareEvent(ctx, key, 0); err != nil {
		t.Fatal(err)
	}
	events, err := coordinator.ClaimDueEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.EventKey == key {
			t.Fatalf("immediate event %q was claimable while emitter owns its lease", key)
		}
	}
	var availableAt time.Time
	if err := db.QueryRowContext(ctx, `SELECT available_at FROM ai_workflow_events WHERE event_key=$1`, key).Scan(&availableAt); err != nil {
		t.Fatal(err)
	}
	if !availableAt.After(time.Now().Add(20 * time.Second)) {
		t.Fatalf("emitter lease was not reserved: available_at=%v", availableAt)
	}
}

var errExecutionInjected = errors.New("injected execution event failure")

type failingExecutionInteractionStore struct{ ExecutionInteractionStore }

func (s failingExecutionInteractionStore) AppendWorkflowRunEventTx(context.Context, *sql.Tx, *domain.WorkflowRunEvent) error {
	return errExecutionInjected
}

func TestExecutionInteractionAndRunEventRollbackTogether(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind)
        VALUES($1,$2,'running','{}','manual') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })

	baseInteractions := workflowrepository.NewInteractionRepository(db)
	coordinator := NewExecutionCoordinator(
		dbtx.NewTransactor(db, nil),
		workflowrepository.NewExecutionRepository(db),
		failingExecutionInteractionStore{baseInteractions},
	)
	if _, err := coordinator.CreateInteraction(ctx, runID, "confirm", "approval", []byte(`{"type":"object"}`), []byte(`{}`), []byte(`[]`), nil); !errors.Is(err, errExecutionInjected) {
		t.Fatalf("create interaction error=%v", err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workflow_interaction_tasks WHERE workflow_run_id=$1`, runID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("rolled-back execution interaction left %d task rows", count)
	}
}

func TestExecutionCheckpointOwnsRunAndStepState(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind)
        VALUES($1,$2,'queued','{}','manual') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })

	coordinator := newTestExecutionCoordinator(db)
	run, err := coordinator.ClaimRun(ctx, runID)
	if err != nil || run.Status != "running" {
		t.Fatalf("claim run=%#v err=%v", run, err)
	}
	if err := coordinator.RecordStep(ctx, &domain.WorkflowStepRun{
		WorkflowRunID: runID, StepID: "checkpoint", StepType: "output", Status: "succeeded",
		Input: []byte(`{}`), Output: []byte(`{"ok":true}`), StartedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	raw, found, err := coordinator.CompletedStepOutput(ctx, runID, "checkpoint", -1)
	if err != nil || !found {
		t.Fatalf("checkpoint found=%v raw=%s err=%v", found, raw, err)
	}
	var checkpoint map[string]any
	if err := json.Unmarshal(raw, &checkpoint); err != nil || checkpoint["ok"] != true {
		t.Fatalf("checkpoint output=%s decoded=%#v err=%v", raw, checkpoint, err)
	}
	if err := coordinator.CompleteRun(ctx, runID, "succeeded", []byte(`{"done":true}`), 3, 5); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := db.QueryRowContext(ctx, `SELECT status FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" {
		t.Fatalf("run status=%q", status)
	}
}
