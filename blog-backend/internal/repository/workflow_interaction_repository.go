package repository

import (
	"context"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

// Workflow interaction persistence now belongs to the Workflow capability.
// These methods remain as a temporary compatibility facade for Agent consumers
// until their constructor dependencies are narrowed to the canonical repository.
func (r *AgentRepository) workflowInteractions() *workflowrepository.InteractionRepository {
	return workflowrepository.NewInteractionRepository(r.db)
}

func (r *AgentRepository) CreateInteraction(ctx context.Context, task *domain.WorkflowInteractionTask) error {
	return r.workflowInteractions().CreateInteraction(ctx, task)
}

func (r *AgentRepository) GetInteraction(ctx context.Context, id int64) (*domain.WorkflowInteractionTask, error) {
	return r.workflowInteractions().GetInteraction(ctx, id)
}

func (r *AgentRepository) ListInteractions(ctx context.Context, workflowRunID int64) ([]*domain.WorkflowInteractionTask, error) {
	return r.workflowInteractions().ListInteractions(ctx, workflowRunID)
}

func (r *AgentRepository) ListPendingInteractions(ctx context.Context) ([]*domain.WorkflowInteractionTask, error) {
	return r.workflowInteractions().ListPendingInteractions(ctx)
}

func (r *AgentRepository) ResolveInteraction(ctx context.Context, id int64, token string, response json.RawMessage, principalID int64) (*domain.WorkflowInteractionTask, error) {
	return r.workflowInteractions().ResolveInteraction(ctx, id, token, response, principalID)
}

func (r *AgentRepository) CancelInteraction(ctx context.Context, id int64, token string, principalID int64) error {
	return r.workflowInteractions().CancelInteraction(ctx, id, token, principalID)
}

func (r *AgentRepository) AppendWorkflowRunEvent(ctx context.Context, event *domain.WorkflowRunEvent) error {
	return r.workflowInteractions().AppendWorkflowRunEvent(ctx, event)
}

func (r *AgentRepository) ListWorkflowRunEvents(ctx context.Context, runID int64) ([]*domain.WorkflowRunEvent, error) {
	return r.workflowInteractions().ListWorkflowRunEvents(ctx, runID)
}

func (r *AgentRepository) ListMediaCandidateEvents(ctx context.Context, candidateID int64) ([]*domain.WorkflowRunEvent, error) {
	return r.workflowInteractions().ListMediaCandidateEvents(ctx, candidateID)
}
