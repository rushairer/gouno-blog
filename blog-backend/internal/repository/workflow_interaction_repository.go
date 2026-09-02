package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func interactionColumns() string {
	return `id,workflow_run_id,agent_run_id,workflow_step_id,interaction_type,schema,payload,options,status,resume_token,response,expires_at,resolved_by_principal_id,resolved_at,created_at,updated_at`
}

func scanInteraction(scanner interface{ Scan(...any) error }) (*domain.WorkflowInteractionTask, error) {
	var item domain.WorkflowInteractionTask
	err := scanner.Scan(&item.ID, &item.WorkflowRunID, &item.AgentRunID, &item.WorkflowStepID, &item.InteractionType,
		&item.Schema, &item.Payload, &item.Options, &item.Status, &item.ResumeToken, &item.Response, &item.ExpiresAt,
		&item.ResolvedByPrincipalID, &item.ResolvedAt, &item.CreatedAt, &item.UpdatedAt)
	return &item, err
}

func (r *AgentRepository) CreateInteraction(ctx context.Context, task *domain.WorkflowInteractionTask) error {
	if task.WorkflowRunID == nil && task.AgentRunID == nil {
		return errors.New("interaction requires a run")
	}
	if task.ResumeToken == "" {
		task.ResumeToken = fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("%d:%d", time.Now().UnixNano(), task.ID))))
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO workflow_interaction_tasks
		(workflow_run_id,agent_run_id,workflow_step_id,interaction_type,schema,payload,options,resume_token,expires_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at,updated_at`, task.WorkflowRunID, task.AgentRunID,
		task.WorkflowStepID, task.InteractionType, task.Schema, task.Payload, task.Options, task.ResumeToken, task.ExpiresAt).
		Scan(&task.ID, &task.CreatedAt, &task.UpdatedAt)
}

func (r *AgentRepository) GetInteraction(ctx context.Context, id int64) (*domain.WorkflowInteractionTask, error) {
	return scanInteraction(r.db.QueryRowContext(ctx, `SELECT `+interactionColumns()+` FROM workflow_interaction_tasks WHERE id=$1`, id))
}

func (r *AgentRepository) ListInteractions(ctx context.Context, workflowRunID int64) ([]*domain.WorkflowInteractionTask, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+interactionColumns()+` FROM workflow_interaction_tasks WHERE workflow_run_id=$1 ORDER BY created_at DESC,id DESC`, workflowRunID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowInteractionTask, 0)
	for rows.Next() {
		item, err := scanInteraction(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AgentRepository) ListPendingInteractions(ctx context.Context) ([]*domain.WorkflowInteractionTask, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+interactionColumns()+` FROM workflow_interaction_tasks WHERE status='pending' AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY created_at DESC,id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowInteractionTask, 0)
	for rows.Next() {
		item, scanErr := scanInteraction(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AgentRepository) ResolveInteraction(ctx context.Context, id int64, token string, response json.RawMessage, principalID int64) (*domain.WorkflowInteractionTask, error) {
	item, err := scanInteraction(r.db.QueryRowContext(ctx, `UPDATE workflow_interaction_tasks SET status='resolved',response=$3,resolved_by_principal_id=$4,resolved_at=NOW(),updated_at=NOW()
		WHERE id=$1 AND resume_token=$2 AND status='pending' AND (expires_at IS NULL OR expires_at>NOW()) RETURNING `+interactionColumns(), id, token, response, principalID))
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (r *AgentRepository) CancelInteraction(ctx context.Context, id int64, token string, principalID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE workflow_interaction_tasks SET status='cancelled',resolved_by_principal_id=$3,resolved_at=NOW(),updated_at=NOW()
		WHERE id=$1 AND resume_token=$2 AND status='pending'`, id, token, principalID)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) AppendWorkflowRunEvent(ctx context.Context, event *domain.WorkflowRunEvent) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO workflow_run_events(workflow_run_id,agent_run_id,workflow_step_id,interaction_task_id,event_type,payload)
		VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at`, event.WorkflowRunID, event.AgentRunID, event.WorkflowStepID, event.InteractionTaskID, event.EventType, event.Payload).
		Scan(&event.ID, &event.CreatedAt)
}

func (r *AgentRepository) ListWorkflowRunEvents(ctx context.Context, runID int64) ([]*domain.WorkflowRunEvent, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,workflow_run_id,agent_run_id,workflow_step_id,interaction_task_id,event_type,payload,created_at FROM workflow_run_events WHERE workflow_run_id=$1 ORDER BY created_at DESC,id DESC`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowRunEvent, 0)
	for rows.Next() {
		var item domain.WorkflowRunEvent
		if err := rows.Scan(&item.ID, &item.WorkflowRunID, &item.AgentRunID, &item.WorkflowStepID, &item.InteractionTaskID, &item.EventType, &item.Payload, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *AgentRepository) ListMediaCandidateEvents(ctx context.Context, candidateID int64) ([]*domain.WorkflowRunEvent, error) {
	var runID sql.NullInt64
	if err := r.db.QueryRowContext(ctx, `SELECT workflow_run_id FROM ai_media_candidates WHERE id=$1`, candidateID).Scan(&runID); err != nil {
		return nil, err
	}
	if !runID.Valid {
		return []*domain.WorkflowRunEvent{}, nil
	}
	return r.ListWorkflowRunEvents(ctx, runID.Int64)
}
