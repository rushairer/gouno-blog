package repository

import (
	"context"
	"database/sql"

	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

// Starter Workflow persistence belongs to the Workflow capability. Keep this
// adapter only while AgentRepository owns the outer bootstrap transaction.
func reconcileProviderDependentStarters(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) (int, error) {
	return workflowrepository.ReconcileProviderDependentStarters(ctx, tx, systemAgents)
}
