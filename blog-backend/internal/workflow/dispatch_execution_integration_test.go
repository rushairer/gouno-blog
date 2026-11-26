package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"testing"
	"time"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"

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

func (s failingExecutionInteractionStore) AppendWorkflowRunEventTx(context.Context, *sql.Tx, *workflowdomain.WorkflowRunEvent) error {
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
	if err := coordinator.RecordStep(ctx, &workflowdomain.WorkflowStepRun{
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

// Discard a successful real database claim acknowledgement.
type workflowClaimAckLossStore struct{ ExecutionStore }

func (s workflowClaimAckLossStore) ClaimRun(ctx context.Context, runID int64) (*workflowdomain.WorkflowRun, error) {
	if _, err := s.ExecutionStore.ClaimRun(ctx, runID); err != nil {
		return nil, err
	}
	return nil, errExecutionInjected
}

type workflowCompletionAckLossStore struct {
	ExecutionStore
	commit bool
}

func (s workflowCompletionAckLossStore) CompleteRun(ctx context.Context, runID int64, status string, output json.RawMessage, inputTokens, outputTokens int64) error {
	if s.commit {
		if err := s.ExecutionStore.CompleteRun(ctx, runID, status, output, inputTokens, outputTokens); err != nil {
			return err
		}
	}
	return errExecutionInjected
}

func newExecutionFenceRun(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	workflowID, versionID := admissionWorkflowVersion(t, db)
	var runID int64
	if err := db.QueryRow(`INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status,input,trigger_kind)
        VALUES($1,$2,'queued','{}','manual') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1`, runID) })
	return runID
}

func assertExecutionFenceStatus(t *testing.T, db *sql.DB, runID int64, want string) {
	t.Helper()
	var status string
	if err := db.QueryRow(`SELECT status FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != want {
		t.Fatalf("run %d status=%q want=%q", runID, status, want)
	}
}

func TestExecutionDuplicateClaimDoesNotFailOwner(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	runID := newExecutionFenceRun(t, db)
	coordinator := newTestExecutionCoordinator(db)
	if _, err := coordinator.ClaimRun(ctx, runID); err != nil {
		t.Fatal(err)
	}
	service := &Service{execution: coordinator}
	if err := service.execute(ctx, runID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("duplicate claim error=%v", err)
	}
	assertExecutionFenceStatus(t, db, runID, "running")
	if err := coordinator.CompleteRun(ctx, runID, "succeeded", []byte(`{}`), 3, 5); err != nil {
		t.Fatal(err)
	}
	assertExecutionFenceStatus(t, db, runID, "succeeded")
}

func TestExecutionLostClaimAcknowledgementDoesNotFinalize(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	runID := newExecutionFenceRun(t, db)
	coordinator := NewExecutionCoordinator(dbtx.NewTransactor(db, nil),
		workflowClaimAckLossStore{workflowrepository.NewExecutionRepository(db)},
		workflowrepository.NewInteractionRepository(db))
	service := &Service{execution: coordinator}
	if err := service.execute(context.Background(), runID); !errors.Is(err, errExecutionInjected) {
		t.Fatalf("claim error=%v", err)
	}
	assertExecutionFenceStatus(t, db, runID, "running")
}

func TestExecutionCompletionCannotOverwriteCancelledOrTerminalRun(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	coordinator := newTestExecutionCoordinator(db)
	for _, status := range []string{"queued", "cancelled", "failed", "succeeded", "waiting_for_user", "awaiting_approval"} {
		t.Run(status, func(t *testing.T) {
			runID := newExecutionFenceRun(t, db)
			if status != "queued" {
				if _, err := coordinator.ClaimRun(ctx, runID); err != nil {
					t.Fatal(err)
				}
				if status == "cancelled" {
					if err := dbtx.NewTransactor(db, nil).Run(ctx, func(tx *sql.Tx) error {
						return workflowrepository.NewRunLifecycleRepository().CancelRunTx(ctx, tx, runID)
					}); err != nil {
						t.Fatal(err)
					}
				} else if _, err := db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2 WHERE id=$1`, runID, status); err != nil {
					t.Fatal(err)
				}
			}
			if err := coordinator.CompleteRun(ctx, runID, "succeeded", []byte(`{"late":true}`), 9, 9); !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf("late completion error=%v", err)
			}
			assertExecutionFenceStatus(t, db, runID, status)
			var inputTokens, outputTokens int64
			if err := db.QueryRow(`SELECT input_tokens,output_tokens FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&inputTokens, &outputTokens); err != nil {
				t.Fatal(err)
			}
			if inputTokens != 0 || outputTokens != 0 {
				t.Fatalf("stale completion overwrote usage: %d/%d", inputTokens, outputTokens)
			}
		})
	}
}

func TestExecutionUnconfirmedCompletionNeverRewritesFailure(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	base := workflowrepository.NewExecutionRepository(db)
	for _, tc := range []struct {
		name   string
		commit bool
		want   string
	}{
		{"before_commit", false, "running"},
		{"after_commit", true, "succeeded"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runID := newExecutionFenceRun(t, db)
			if _, err := base.ClaimRun(ctx, runID); err != nil {
				t.Fatal(err)
			}
			coordinator := NewExecutionCoordinator(dbtx.NewTransactor(db, nil),
				workflowCompletionAckLossStore{ExecutionStore: base, commit: tc.commit},
				workflowrepository.NewInteractionRepository(db))
			service := &Service{execution: coordinator}
			workerCtx, cancel := context.WithCancel(ctx)
			cancel()
			outcome := workflowExecutionOutcome{status: "succeeded", output: []byte(`{}`), inputTokens: 3, outputTokens: 5}
			if err := service.finishExecution(workerCtx, runID, outcome, nil); !errors.Is(err, errExecutionInjected) {
				t.Fatalf("completion error=%v", err)
			}
			assertExecutionFenceStatus(t, db, runID, tc.want)
		})
	}
}

type checkpointAckLossStore struct {
	ExecutionStore
	commit bool
}

func (s checkpointAckLossStore) RecordStep(ctx context.Context, step *workflowdomain.WorkflowStepRun) error {
	if s.commit {
		if err := s.ExecutionStore.RecordStep(ctx, step); err != nil {
			return err
		}
	}
	return errExecutionInjected
}

func TestExecutionCheckpointAcknowledgementLossPreservesClaim(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	for _, tc := range []struct {
		name     string
		commit   bool
		wantRows int
	}{
		{"before_insert", false, 0},
		{"after_insert", true, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runID := newExecutionFenceRun(t, db)
			base := workflowrepository.NewExecutionRepository(db)
			run, err := base.ClaimRun(ctx, runID)
			if err != nil {
				t.Fatal(err)
			}
			s := &Service{execution: NewExecutionCoordinator(dbtx.NewTransactor(db, nil),
				checkpointAckLossStore{ExecutionStore: base, commit: tc.commit}, workflowrepository.NewInteractionRepository(db))}
			doc := map[string]any{"input": map[string]any{}, "steps": map[string]any{}}
			steps := []workflowdomain.WorkflowStep{{ID: "first", Type: "output", OutputPointer: "/input"}, {ID: "blocked", Type: "model"}}
			_, _, _, _, err = s.executeSteps(ctx, run, steps, doc, nil, nil)
			if !errors.Is(err, errWorkflowEvidenceUnconfirmed) || !errors.Is(err, errExecutionInjected) {
				t.Fatalf("checkpoint error=%v", err)
			}
			if err := s.finishExecution(ctx, runID, workflowExecutionOutcome{}, err); !errors.Is(err, errWorkflowEvidenceUnconfirmed) {
				t.Fatalf("finish error=%v", err)
			}
			assertExecutionFenceStatus(t, db, runID, "running")
			var rows int
			if err := db.QueryRowContext(ctx, "SELECT count(*) FROM ai_workflow_step_runs WHERE workflow_run_id=$1", runID).Scan(&rows); err != nil || rows != tc.wantRows {
				t.Fatalf("checkpoint rows=%d err=%v", rows, err)
			}
		})
	}
}

func TestExecutionCheckpointConflictAndFailedHistoryAreNotAcknowledged(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	runID := newExecutionFenceRun(t, db)
	base := workflowrepository.NewExecutionRepository(db)
	run, err := base.ClaimRun(ctx, runID)
	if err != nil {
		t.Fatal(err)
	}
	step := &workflowdomain.WorkflowStepRun{WorkflowRunID: runID, StepID: "model", StepType: "model", Status: "failed",
		Input: json.RawMessage("{}"), Output: json.RawMessage("null"), StartedAt: time.Now()}
	if err := base.RecordStep(ctx, step); err != nil {
		t.Fatal(err)
	}
	if err := base.RecordStep(ctx, step); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("duplicate insert error=%v", err)
	}
	s := &Service{execution: NewExecutionCoordinator(dbtx.NewTransactor(db, nil), base, workflowrepository.NewInteractionRepository(db))}
	doc := map[string]any{"input": map[string]any{}, "steps": map[string]any{}}
	_, _, _, _, err = s.executeSteps(ctx, run, []workflowdomain.WorkflowStep{{ID: "model", Type: "model"}}, doc, nil, nil)
	if !errors.Is(err, errWorkflowEvidenceUnconfirmed) {
		t.Fatalf("failed checkpoint authorized replay: %v", err)
	}
	assertExecutionFenceStatus(t, db, runID, "running")
}

func TestExecutionResumeAccumulatesNewUsage(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	runID := newExecutionFenceRun(t, db)
	execution := newTestExecutionCoordinator(db)
	admission := workflowrepository.NewRunAdmissionRepository(db)

	assertUsage := func(wantIn, wantOut int64) {
		t.Helper()
		var in, out int64
		if err := db.QueryRowContext(ctx, `SELECT input_tokens,output_tokens FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&in, &out); err != nil {
			t.Fatal(err)
		}
		if in != wantIn || out != wantOut {
			t.Fatalf("usage=%d/%d want=%d/%d", in, out, wantIn, wantOut)
		}
	}
	for _, phase := range []struct {
		status                 string
		in, out, sumIn, sumOut int64
	}{
		{"waiting_for_user", 3, 5, 3, 5},
		{"waiting_for_user", 7, 11, 10, 16},
		{"succeeded", 0, 0, 10, 16},
	} {
		if _, err := execution.ClaimRun(ctx, runID); err != nil {
			t.Fatal(err)
		}
		if err := execution.CompleteRun(ctx, runID, phase.status, []byte(`{}`), -1, 0); err == nil {
			t.Fatal("negative usage was accepted")
		}
		assertExecutionFenceStatus(t, db, runID, "running")
		if err := execution.CompleteRun(ctx, runID, phase.status, []byte(`{}`), phase.in, phase.out); err != nil {
			t.Fatal(err)
		}
		assertUsage(phase.sumIn, phase.sumOut)
		if err := execution.CompleteRun(ctx, runID, phase.status, []byte(`{}`), phase.in, phase.out); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("duplicate completion error=%v", err)
		}
		assertUsage(phase.sumIn, phase.sumOut)
		if phase.status == "waiting_for_user" {
			changed, err := admission.ResumeUserRun(ctx, runID)
			if err != nil || !changed {
				t.Fatalf("resume changed=%v err=%v", changed, err)
			}
		}
	}
	assertExecutionFenceStatus(t, db, runID, "succeeded")
}
