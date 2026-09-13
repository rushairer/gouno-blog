package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
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

func (r *ExecutionRepository) ClaimRun(ctx context.Context, runID int64) (*domain.WorkflowRun, error) {
	run := &domain.WorkflowRun{ID: runID, Status: "running"}
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
	return run, nil
}

func (r *ExecutionRepository) FailRun(ctx context.Context, runID int64, code, message string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='failed',error_code=$2,error_message=$3,finished_at=NOW()
        WHERE id=$1 AND status='running'`, runID, code, message)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
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
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2,output=$3,input_tokens=$4,output_tokens=$5,finished_at=NOW() WHERE id=$1`,
		runID, status, output, inputTokens, outputTokens)
	return err
}

func (r *ExecutionRepository) PendingInteractionCount(ctx context.Context, runID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workflow_interaction_tasks WHERE workflow_run_id=$1 AND status='pending'`, runID).Scan(&count)
	return count, err
}

func (r *ExecutionRepository) CompletedStepOutput(ctx context.Context, runID int64, stepID string, iteration int) (json.RawMessage, bool, error) {
	var output json.RawMessage
	err := r.db.QueryRowContext(ctx, `SELECT output FROM ai_workflow_step_runs
        WHERE workflow_run_id=$1 AND step_id=$2 AND iteration=$3 AND status='succeeded' ORDER BY id DESC LIMIT 1`, runID, stepID, iteration).Scan(&output)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	return output, err == nil, err
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

func (r *ExecutionRepository) TargetResources(ctx context.Context, runID int64) ([]domain.WorkflowResource, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT resource_type,resource_key FROM ai_workflow_run_resources
        WHERE workflow_run_id=$1 AND access_level='target'`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.WorkflowResource, 0)
	for rows.Next() {
		var item domain.WorkflowResource
		if err := rows.Scan(&item.ResourceType, &item.ResourceKey); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ExecutionRepository) UpsertRunResource(ctx context.Context, resource *domain.WorkflowResource) error {
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

func (r *ExecutionRepository) RecordStep(ctx context.Context, step *domain.WorkflowStepRun) error {
	iteration := -1
	if step.Iteration != nil {
		iteration = *step.Iteration
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs
        (workflow_run_id,step_id,step_type,status,input,output,error_message,started_at,iteration,finished_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (workflow_run_id,step_id,iteration) DO NOTHING`,
		step.WorkflowRunID, step.StepID, step.StepType, step.Status, step.Input, step.Output, step.ErrorMessage, step.StartedAt, iteration)
	return err
}
