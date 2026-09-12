package repository

import (
	"context"
	"database/sql"
	"errors"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

var ErrResourceInUse = errors.New("resource is in use")

type AgentRepository struct {
	db *sql.DB
}

func NewAgentRepository(db *sql.DB) *AgentRepository {
	return &AgentRepository{db: db}
}

// BootstrapStarterPack remains as a compatibility facade while management
// consumers migrate to the capability-owned Agent repository.
func (r *AgentRepository) BootstrapStarterPack(ctx context.Context) (int, error) {
	return agentrepository.NewAgentRepository(r.db).BootstrapStarterPack(ctx)
}
