package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

type RunAdmissionRepository struct {
	db *sql.DB
}

func NewRunAdmissionRepository(db *sql.DB) *RunAdmissionRepository {
	if db == nil {
		panic("workflow/repository.NewRunAdmissionRepository: db is required")
	}
	return &RunAdmissionRepository{db: db}
}

func (r *RunAdmissionRepository) CreateRunTx(ctx context.Context, tx *sql.Tx, run *workflowdomain.WorkflowRun) (bool, error) {
	query := `INSERT INTO ai_workflow_runs
		(workflow_id,workflow_version_id,dry_run,input,triggered_by_principal_id,trigger_kind,source_ref,schedule_key)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at`
	if run.ScheduleKey != nil {
		query = `INSERT INTO ai_workflow_runs
			(workflow_id,workflow_version_id,dry_run,input,triggered_by_principal_id,trigger_kind,source_ref,schedule_key)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (workflow_id,schedule_key) WHERE schedule_key IS NOT NULL DO NOTHING
			RETURNING id,created_at`
	}
	err := tx.QueryRowContext(ctx, query, run.WorkflowID, run.WorkflowVersionID, run.DryRun, run.Input,
		run.TriggeredByPrincipalID, run.TriggerKind, run.SourceRef, run.ScheduleKey).Scan(&run.ID, &run.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) && run.ScheduleKey != nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *RunAdmissionRepository) LockScheduledRunTx(ctx context.Context, tx *sql.Tx, workflowID int64, scheduleKey string) (*workflowdomain.WorkflowRun, error) {
	var run workflowdomain.WorkflowRun
	var output, retryIterations []byte
	err := tx.QueryRowContext(ctx, `SELECT id,workflow_id,workflow_version_id,dry_run,status,input,output,
		error_code,error_message,input_tokens,output_tokens,triggered_by_principal_id,trigger_kind,source_ref,
		schedule_key,retry_of_run_id,retry_step_id,retry_iterations,started_at,finished_at,created_at
		FROM ai_workflow_runs WHERE workflow_id=$1 AND schedule_key=$2 FOR UPDATE`, workflowID, scheduleKey).
		Scan(&run.ID, &run.WorkflowID, &run.WorkflowVersionID, &run.DryRun, &run.Status, &run.Input, &output,
			&run.ErrorCode, &run.ErrorMessage, &run.InputTokens, &run.OutputTokens, &run.TriggeredByPrincipalID,
			&run.TriggerKind, &run.SourceRef, &run.ScheduleKey, &run.RetryOfRunID, &run.RetryStepID, &retryIterations,
			&run.StartedAt, &run.FinishedAt, &run.CreatedAt)
	if err != nil {
		return nil, err
	}
	run.Output = json.RawMessage(output)
	if len(retryIterations) > 0 {
		if err := json.Unmarshal(retryIterations, &run.RetryIterations); err != nil {
			return nil, err
		}
	}
	return &run, nil
}

func upsertAdmissionResourceTx(ctx context.Context, tx *sql.Tx, runID int64, item workflowdomain.WorkflowResource) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources
		(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT(workflow_run_id,resource_type,resource_key) DO UPDATE SET
		access_level=CASE WHEN ai_workflow_run_resources.access_level='target' OR EXCLUDED.access_level='target' THEN 'target' ELSE 'read' END,
		source=CASE WHEN ai_workflow_run_resources.source='manual' THEN 'manual' ELSE EXCLUDED.source END`,
		runID, item.ResourceType, item.ResourceKey, item.Source, item.AccessLevel, item.Label, item.VersionToken, item.Snapshot)
	return err
}

func (r *RunAdmissionRepository) InsertAdmissionResourcesTx(ctx context.Context, tx *sql.Tx, runID int64, resources []workflowdomain.WorkflowResource) error {
	for _, item := range resources {
		if err := upsertAdmissionResourceTx(ctx, tx, runID, item); err != nil {
			return err
		}
	}
	return nil
}

func scanRetrySource(scanner interface{ Scan(...any) error }) (*workflowdomain.WorkflowRun, error) {
	var run workflowdomain.WorkflowRun
	err := scanner.Scan(&run.WorkflowID, &run.WorkflowVersionID, &run.DryRun, &run.Input, &run.Status, &run.TriggerKind, &run.RetryOfRunID)
	return &run, err
}

func (r *RunAdmissionRepository) RetrySource(ctx context.Context, runID int64) (*workflowdomain.WorkflowRun, error) {
	return scanRetrySource(r.db.QueryRowContext(ctx, `SELECT workflow_id,workflow_version_id,dry_run,input,status,trigger_kind,retry_of_run_id
		FROM ai_workflow_runs WHERE id=$1`, runID))
}

func (r *RunAdmissionRepository) LockRetrySourceTx(ctx context.Context, tx *sql.Tx, runID int64) (*workflowdomain.WorkflowRun, error) {
	return scanRetrySource(tx.QueryRowContext(ctx, `SELECT workflow_id,workflow_version_id,dry_run,input,status,trigger_kind,retry_of_run_id
		FROM ai_workflow_runs WHERE id=$1 FOR UPDATE`, runID))
}

func (r *RunAdmissionRepository) CountFailedIterationsTx(ctx context.Context, tx *sql.Tx, runID int64, childStepID string, iterations []int) (int, error) {
	failed := 0
	for _, iteration := range iterations {
		var exists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_step_runs
			WHERE workflow_run_id=$1 AND step_id=$2 AND iteration=$3 AND status='failed')`, runID, childStepID, iteration).Scan(&exists); err != nil {
			return 0, err
		}
		if exists {
			failed++
		}
	}
	return failed, nil
}

// HasActiveRetryTx must be called after locking the source Run, in the same
// read-committed admission transaction.
func (r *RunAdmissionRepository) HasActiveRetryTx(ctx context.Context, tx *sql.Tx, sourceRunID int64) (bool, error) {
	var exists bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs
		WHERE retry_of_run_id=$1 AND status IN ('queued','running','waiting_for_user','awaiting_approval'))`, sourceRunID).Scan(&exists)
	return exists, err
}

// HasConsumedRetryIterationTx checks the durable admission ledger, including
// retries whose Run records have since been deleted. The source row is locked.
func (r *RunAdmissionRepository) HasConsumedRetryIterationTx(ctx context.Context, tx *sql.Tx, sourceRunID int64, iterations []int) (bool, error) {
	raw, err := json.Marshal(iterations)
	if err != nil {
		return false, err
	}
	var exists bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_retry_admissions
		WHERE source_run_id=$1 AND iteration IN
		(SELECT value::integer FROM jsonb_array_elements_text($2::jsonb) AS items(value)))`, sourceRunID, raw).Scan(&exists)
	return exists, err
}

func (r *RunAdmissionRepository) CreateRetryRunTx(ctx context.Context, tx *sql.Tx, run *workflowdomain.WorkflowRun) error {
	rawIterations, err := json.Marshal(run.RetryIterations)
	if err != nil {
		return err
	}
	return tx.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs
		(workflow_id,workflow_version_id,dry_run,input,triggered_by_principal_id,trigger_kind,source_ref,retry_of_run_id,retry_step_id,retry_iterations)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,created_at`, run.WorkflowID, run.WorkflowVersionID,
		run.DryRun, run.Input, run.TriggeredByPrincipalID, run.TriggerKind, run.SourceRef, run.RetryOfRunID, run.RetryStepID, rawIterations).
		Scan(&run.ID, &run.CreatedAt)
}

func (r *RunAdmissionRepository) CopyRetryResourcesTx(ctx context.Context, tx *sql.Tx, sourceRunID, retryRunID int64) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources
		(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
		SELECT $2,resource_type,resource_key,source,access_level,label,version_token,snapshot
		FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND source IN ('manual','query')`, sourceRunID, retryRunID)
	return err
}

func (r *RunAdmissionRepository) CopyRetryQueryStepsTx(ctx context.Context, tx *sql.Tx, sourceRunID, retryRunID int64) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs
		(workflow_run_id,step_id,step_type,iteration,status,input,output,error_message,started_at,finished_at)
		SELECT $2,step_id,step_type,iteration,status,input,output,error_message,started_at,finished_at
		FROM ai_workflow_step_runs WHERE workflow_run_id=$1 AND step_type='resource_query' AND iteration=-1 AND status='succeeded'`, sourceRunID, retryRunID)
	return err
}

func (r *RunAdmissionRepository) ListQueuedRunIDs(ctx context.Context, limit int) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id FROM ai_workflow_runs WHERE status='queued' ORDER BY created_at LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]int64, 0, limit)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *RunAdmissionRepository) ResumeUserRun(ctx context.Context, runID int64) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='queued',finished_at=NULL,error_code=NULL,error_message=NULL
		WHERE id=$1 AND status='waiting_for_user'`, runID)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
}
