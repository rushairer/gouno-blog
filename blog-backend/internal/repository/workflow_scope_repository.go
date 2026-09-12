package repository

import (
	"context"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

// Workflow scope/resource persistence belongs to the Workflow capability. Keep
// this facade while Agent Runner still depends on the transitional AgentRepository.
func (r *AgentRepository) workflowScopes() *workflowrepository.ScopeRepository {
	return workflowrepository.NewScopeRepository(r.db)
}

func (r *AgentRepository) WorkflowScopePolicy(ctx context.Context, workflowVersionID int64) (domain.WorkflowScopePolicy, error) {
	return r.workflowScopes().WorkflowScopePolicy(ctx, workflowVersionID)
}

func (r *AgentRepository) WorkflowResourceAccess(ctx context.Context, workflowRunID int64, resourceType, key string) (string, bool, error) {
	return r.workflowScopes().WorkflowResourceAccess(ctx, workflowRunID, resourceType, key)
}

func (r *AgentRepository) AddDiscoveredWorkflowResource(ctx context.Context, workflowRunID int64, resourceType, key, label string, snapshot json.RawMessage) error {
	return r.workflowScopes().AddDiscoveredWorkflowResource(ctx, workflowRunID, resourceType, key, label, snapshot)
}
