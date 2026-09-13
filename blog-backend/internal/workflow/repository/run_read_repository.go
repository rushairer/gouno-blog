package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

// RunReadRepository owns read-only admin projections over Workflow Run state.
// Runtime execution reads remain with ExecutionRepository because they belong
// to the execution state machine rather than the admin query surface.
type RunReadRepository struct {
	db *sql.DB
}

func NewRunReadRepository(db *sql.DB) *RunReadRepository {
	if db == nil {
		panic("workflow repository.NewRunReadRepository: db is required")
	}
	return &RunReadRepository{db: db}
}

func (r *RunReadRepository) ListRuns(ctx context.Context, workflowID int64) ([]*domain.WorkflowRun, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, workflow_id, workflow_version_id, dry_run,
		status, input, output, error_code, error_message, input_tokens, output_tokens, triggered_by_principal_id, trigger_kind, source_ref,
		schedule_key, retry_of_run_id, retry_step_id, retry_iterations, started_at, finished_at, created_at FROM ai_workflow_runs
		WHERE ($1=0 OR workflow_id=$1) ORDER BY COALESCE(started_at,created_at) DESC, id DESC LIMIT 100`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowRun, 0)
	for rows.Next() {
		var item domain.WorkflowRun
		var output, retryIterations []byte
		if err := rows.Scan(&item.ID, &item.WorkflowID, &item.WorkflowVersionID, &item.DryRun,
			&item.Status, &item.Input, &output, &item.ErrorCode, &item.ErrorMessage,
			&item.InputTokens, &item.OutputTokens, &item.TriggeredByPrincipalID, &item.TriggerKind, &item.SourceRef, &item.ScheduleKey, &item.RetryOfRunID, &item.RetryStepID, &retryIterations, &item.StartedAt,
			&item.FinishedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		if len(output) > 0 {
			item.Output = json.RawMessage(output)
		}
		if len(retryIterations) > 0 {
			_ = json.Unmarshal(retryIterations, &item.RetryIterations)
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *RunReadRepository) RunSteps(ctx context.Context, runID int64) ([]*domain.WorkflowStepRun, bool, error) {
	var exists bool
	if err := r.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM ai_workflow_runs WHERE id=$1)`, runID).Scan(&exists); err != nil {
		return nil, false, err
	}
	if !exists {
		return nil, false, nil
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id,workflow_run_id,step_id,step_type,NULLIF(iteration,-1),
		status,input,output,error_message,started_at,finished_at FROM ai_workflow_step_runs
		WHERE workflow_run_id=$1 ORDER BY started_at,id`, runID)
	if err != nil {
		return nil, true, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowStepRun, 0)
	for rows.Next() {
		var item domain.WorkflowStepRun
		var input, output []byte
		if err := rows.Scan(&item.ID, &item.WorkflowRunID, &item.StepID, &item.StepType,
			&item.Iteration, &item.Status, &input, &output, &item.ErrorMessage,
			&item.StartedAt, &item.FinishedAt); err != nil {
			return nil, true, err
		}
		if len(input) > 0 {
			item.Input = json.RawMessage(input)
		}
		if len(output) > 0 {
			item.Output = json.RawMessage(output)
		}
		items = append(items, &item)
	}
	return items, true, rows.Err()
}

func (r *RunReadRepository) ListResources(ctx context.Context, runID int64) ([]domain.WorkflowResource, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot,created_at
		FROM ai_workflow_run_resources WHERE workflow_run_id=$1 ORDER BY created_at,id`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.WorkflowResource, 0)
	for rows.Next() {
		var item domain.WorkflowResource
		if err := rows.Scan(&item.ID, &item.WorkflowRunID, &item.ResourceType, &item.ResourceKey, &item.Source, &item.AccessLevel, &item.Label, &item.VersionToken, &item.Snapshot, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
