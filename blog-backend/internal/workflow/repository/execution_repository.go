package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

type ExecutionRepository struct {
	db *sql.DB
}

func NewExecutionRepository(db *sql.DB) *ExecutionRepository {
	if db == nil {
		panic("workflow repository.NewExecutionRepository: db is required")
	}
	return &ExecutionRepository{db: db}
}

func (r *ExecutionRepository) ClaimRun(ctx context.Context, runID int64) (*workflowdomain.WorkflowRun, error) {
	run := &workflowdomain.WorkflowRun{ID: runID, Status: "running"}
	var retryIterations []byte
	err := r.db.QueryRowContext(ctx, `UPDATE ai_workflow_runs SET status='running', started_at=NOW()
        WHERE id=$1 AND status='queued'
        RETURNING workflow_id,workflow_version_id,dry_run,input,triggered_by_principal_id,trigger_kind,source_ref,retry_of_run_id,retry_step_id,retry_iterations,started_at,created_at`, runID).
		Scan(&run.WorkflowID, &run.WorkflowVersionID, &run.DryRun, &run.Input, &run.TriggeredByPrincipalID, &run.TriggerKind, &run.SourceRef,
			&run.RetryOfRunID, &run.RetryStepID, &retryIterations, &run.StartedAt, &run.CreatedAt)
	if err != nil {
		return nil, err
	}
	if len(retryIterations) > 0 {
		if err := json.Unmarshal(retryIterations, &run.RetryIterations); err != nil {
			return nil, err
		}
	}
	// Admission evidence is not proof of external effects. Require ownership
	// before returning a dispatchable claim, including historical queued retries.
	// An uncertain or unowned claim remains running for operator inspection.
	if run.TriggerKind == "retry" || run.RetryOfRunID != nil || run.RetryStepID != nil || len(run.RetryIterations) != 0 {
		if run.TriggerKind != "retry" || run.RetryOfRunID == nil || *run.RetryOfRunID <= 0 || run.RetryStepID == nil || len(run.RetryIterations) == 0 {
			return nil, errors.New("workflow retry admission identity is unconfirmed")
		}
		var owned, selected int
		var sourceMatches bool
		err := r.db.QueryRowContext(ctx, `SELECT COUNT(*),
			COUNT(*) FILTER (WHERE iteration IN (SELECT value::integer FROM jsonb_array_elements_text($3::jsonb) AS items(value))),
			EXISTS (SELECT 1 FROM ai_workflow_runs s WHERE s.id=$1 AND s.workflow_id=$4
				AND s.workflow_version_id=$5 AND s.status='succeeded' AND s.trigger_kind <> 'retry' AND s.retry_of_run_id IS NULL)
			FROM ai_workflow_retry_admissions WHERE source_run_id=$1 AND retry_run_id=$2`,
			*run.RetryOfRunID, run.ID, retryIterations, run.WorkflowID, run.WorkflowVersionID).Scan(&owned, &selected, &sourceMatches)
		if err != nil {
			return nil, err
		}
		if !sourceMatches || owned != len(run.RetryIterations) || selected != owned {
			return nil, errors.New("workflow retry admission ownership is unconfirmed")
		}
	}
	return run, nil
}

func (r *ExecutionRepository) FailRun(ctx context.Context, runID int64, code, message string, inputTokens, outputTokens int64) (bool, error) {
	if inputTokens < 0 || outputTokens < 0 {
		return false, errors.New("workflow failure usage cannot be negative")
	}
	// Observed usage belongs to this execution phase, even when it fails.
	// Persist it atomically with the guarded failure transition.
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='failed',error_code=$2,error_message=$3,input_tokens=input_tokens+$4,output_tokens=output_tokens+$5,finished_at=NOW()
        WHERE id=$1 AND status='running'`, runID, code, message, inputTokens, outputTokens)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed == 1, err
}

func (r *ExecutionRepository) FailureNotificationTarget(ctx context.Context, runID int64) (*int64, string, int64, error) {
	var recipientPrincipalID *int64
	var name string
	var workflowID int64
	err := r.db.QueryRowContext(ctx, `SELECT COALESCE(r.triggered_by_principal_id,w.created_by_principal_id),w.name,w.id
        FROM ai_workflow_runs r JOIN ai_workflows w ON w.id=r.workflow_id WHERE r.id=$1`, runID).
		Scan(&recipientPrincipalID, &name, &workflowID)
	return recipientPrincipalID, name, workflowID, err
}

func (r *ExecutionRepository) ResetResourceQueryStats(ctx context.Context, workflowID, runID int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflows SET resource_query_last_count=0,resource_query_last_run_at=NOW()
        WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM ai_workflow_run_resources WHERE workflow_run_id=$2 AND source='query')`, workflowID, runID)
	return err
}

func (r *ExecutionRepository) CompleteRun(ctx context.Context, runID int64, status string, output json.RawMessage, inputTokens, outputTokens int64) error {
	if inputTokens < 0 || outputTokens < 0 {
		return errors.New("workflow completion usage cannot be negative")
	}
	// The worker reports only newly observed usage for this claim. Resumed
	// steps reuse checkpoints without counting their historical tokens again.
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2,output=$3,input_tokens=input_tokens+$4,output_tokens=output_tokens+$5,finished_at=NOW()
        WHERE id=$1 AND status='running'`,
		runID, status, output, inputTokens, outputTokens)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *ExecutionRepository) PendingInteractionCount(ctx context.Context, runID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workflow_interaction_tasks WHERE workflow_run_id=$1 AND status='pending'`, runID).Scan(&count)
	return count, err
}

func (r *ExecutionRepository) CompletedStepOutput(ctx context.Context, runID int64, stepID string, iteration int) (json.RawMessage, bool, error) {
	var output json.RawMessage
	var status string
	err := r.db.QueryRowContext(ctx, `SELECT status,output FROM ai_workflow_step_runs
        WHERE workflow_run_id=$1 AND step_id=$2 AND iteration=$3 ORDER BY id DESC LIMIT 1`, runID, stepID, iteration).Scan(&status, &output)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if status != "succeeded" {
		// A same-run failed checkpoint is not proof that its effects can be
		// replayed. Explicit partial retries have a distinct run identity.
		return nil, false, errors.New("existing workflow checkpoint is not successful")
	}
	return output, true, nil
}

func (r *ExecutionRepository) ResolvedInteractionResponse(ctx context.Context, runID int64, stepID string) (json.RawMessage, bool, error) {
	var response json.RawMessage
	err := r.db.QueryRowContext(ctx, `SELECT response FROM workflow_interaction_tasks
        WHERE workflow_run_id=$1 AND workflow_step_id=$2 AND status='resolved' ORDER BY id DESC LIMIT 1`, runID, stepID).Scan(&response)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	return response, err == nil, err
}

func (r *ExecutionRepository) TargetResources(ctx context.Context, runID int64) ([]workflowdomain.WorkflowResource, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT resource_type,resource_key FROM ai_workflow_run_resources
        WHERE workflow_run_id=$1 AND access_level='target'`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]workflowdomain.WorkflowResource, 0)
	for rows.Next() {
		var item workflowdomain.WorkflowResource
		if err := rows.Scan(&item.ResourceType, &item.ResourceKey); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ExecutionRepository) UpsertRunResource(ctx context.Context, resource *workflowdomain.WorkflowResource) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources
        (workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(workflow_run_id,resource_type,resource_key) DO UPDATE SET
        access_level=CASE WHEN ai_workflow_run_resources.access_level='target' OR EXCLUDED.access_level='target' THEN 'target' ELSE 'read' END,
        source=CASE WHEN ai_workflow_run_resources.source='manual' THEN 'manual' ELSE EXCLUDED.source END`,
		resource.WorkflowRunID, resource.ResourceType, resource.ResourceKey, resource.Source, resource.AccessLevel, resource.Label, resource.VersionToken, resource.Snapshot)
	return err
}

func (r *ExecutionRepository) UpdateResourceQueryStats(ctx context.Context, workflowID, runID int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflows SET resource_query_last_count=(SELECT COUNT(*) FROM ai_workflow_run_resources
        WHERE workflow_run_id=$2 AND source='query' AND access_level='target'),resource_query_last_run_at=NOW() WHERE id=$1`, workflowID, runID)
	return err
}

func (r *ExecutionRepository) RecordStep(ctx context.Context, step *workflowdomain.WorkflowStepRun) error {
	iteration := -1
	if step.Iteration != nil {
		iteration = *step.Iteration
	}
	result, err := r.db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs
        (workflow_run_id,step_id,step_type,status,input,output,error_message,started_at,iteration,finished_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (workflow_run_id,step_id,iteration) DO NOTHING`,
		step.WorkflowRunID, step.StepID, step.StepType, step.Status, step.Input, step.Output, step.ErrorMessage, step.StartedAt, iteration)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return sql.ErrNoRows
	}
	return nil
}
