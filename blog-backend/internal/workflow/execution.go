package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"time"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
)

type ExecutionStore interface {
	ClaimRun(context.Context, int64) (*workflowdomain.WorkflowRun, error)
	FailRun(context.Context, int64, string, string) (bool, error)
	FailureNotificationTarget(context.Context, int64) (*int64, string, int64, error)
	ResetResourceQueryStats(context.Context, int64, int64) error
	CompleteRun(context.Context, int64, string, json.RawMessage, int64, int64) error
	PendingInteractionCount(context.Context, int64) (int, error)
	CompletedStepOutput(context.Context, int64, string, int) (json.RawMessage, bool, error)
	ResolvedInteractionResponse(context.Context, int64, string) (json.RawMessage, bool, error)
	TargetResources(context.Context, int64) ([]workflowdomain.WorkflowResource, error)
	UpsertRunResource(context.Context, *workflowdomain.WorkflowResource) error
	UpdateResourceQueryStats(context.Context, int64, int64) error
	RecordStep(context.Context, *workflowdomain.WorkflowStepRun) error
}

type ExecutionInteractionStore interface {
	CreateInteractionTx(context.Context, *sql.Tx, *workflowdomain.WorkflowInteractionTask) error
	AppendWorkflowRunEventTx(context.Context, *sql.Tx, *workflowdomain.WorkflowRunEvent) error
}

type ExecutedApprovalTargetReader interface {
	ListExecutedTargets(context.Context, int64) ([]*domain.AgentApproval, error)
}

type ExecutionCoordinator struct {
	transactor   *dbtx.Transactor
	store        ExecutionStore
	interactions ExecutionInteractionStore
}

func NewExecutionCoordinator(transactor *dbtx.Transactor, store ExecutionStore, interactions ExecutionInteractionStore) *ExecutionCoordinator {
	if transactor == nil {
		panic("workflow.NewExecutionCoordinator: transactor is required")
	}
	if store == nil || interactions == nil {
		panic("workflow.NewExecutionCoordinator: stores are required")
	}
	return &ExecutionCoordinator{transactor: transactor, store: store, interactions: interactions}
}

func (c *ExecutionCoordinator) ClaimRun(ctx context.Context, runID int64) (*workflowdomain.WorkflowRun, error) {
	return c.store.ClaimRun(ctx, runID)
}

func (c *ExecutionCoordinator) FailRun(ctx context.Context, runID int64, code, message string) (bool, error) {
	return c.store.FailRun(ctx, runID, code, message)
}

func (c *ExecutionCoordinator) FailureNotificationTarget(ctx context.Context, runID int64) (*int64, string, int64, error) {
	return c.store.FailureNotificationTarget(ctx, runID)
}

func (c *ExecutionCoordinator) ResetResourceQueryStats(ctx context.Context, workflowID, runID int64) error {
	return c.store.ResetResourceQueryStats(ctx, workflowID, runID)
}

func (c *ExecutionCoordinator) CompleteRun(ctx context.Context, runID int64, status string, output json.RawMessage, inputTokens, outputTokens int64) error {
	return c.store.CompleteRun(ctx, runID, status, output, inputTokens, outputTokens)
}

func (c *ExecutionCoordinator) PendingInteractionCount(ctx context.Context, runID int64) (int, error) {
	return c.store.PendingInteractionCount(ctx, runID)
}

func (c *ExecutionCoordinator) CompletedStepOutput(ctx context.Context, runID int64, stepID string, iteration int) (json.RawMessage, bool, error) {
	return c.store.CompletedStepOutput(ctx, runID, stepID, iteration)
}

func (c *ExecutionCoordinator) ResolvedInteractionResponse(ctx context.Context, runID int64, stepID string) (json.RawMessage, bool, error) {
	return c.store.ResolvedInteractionResponse(ctx, runID, stepID)
}

func (c *ExecutionCoordinator) TargetResources(ctx context.Context, runID int64) ([]workflowdomain.WorkflowResource, error) {
	return c.store.TargetResources(ctx, runID)
}

func (c *ExecutionCoordinator) UpsertRunResource(ctx context.Context, resource *workflowdomain.WorkflowResource) error {
	return c.store.UpsertRunResource(ctx, resource)
}

func (c *ExecutionCoordinator) UpdateResourceQueryStats(ctx context.Context, workflowID, runID int64) error {
	return c.store.UpdateResourceQueryStats(ctx, workflowID, runID)
}

func (c *ExecutionCoordinator) RecordStep(ctx context.Context, step *workflowdomain.WorkflowStepRun) error {
	return c.store.RecordStep(ctx, step)
}

func (c *ExecutionCoordinator) CreateInteraction(ctx context.Context, runID int64, stepID, interactionType string, schema, payload, options json.RawMessage, expiresAt *time.Time) (int64, error) {
	runIDValue := runID
	task := &workflowdomain.WorkflowInteractionTask{
		WorkflowRunID:   &runIDValue,
		WorkflowStepID:  stepID,
		InteractionType: interactionType,
		Schema:          schema,
		Payload:         payload,
		Options:         options,
		ExpiresAt:       expiresAt,
	}
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		if err := c.interactions.CreateInteractionTx(ctx, tx, task); err != nil {
			return err
		}
		eventPayload, err := json.Marshal(map[string]any{
			"status":              "waiting_for_user",
			"interaction_task_id": task.ID,
			"interaction_type":    interactionType,
		})
		if err != nil {
			return err
		}
		event := &workflowdomain.WorkflowRunEvent{
			WorkflowRunID:  &runIDValue,
			WorkflowStepID: stepID,
			EventType:      "human_interaction_created",
			Payload:        eventPayload,
		}
		return c.interactions.AppendWorkflowRunEventTx(ctx, tx, event)
	})
	return task.ID, err
}
