package repository

import (
	"context"
	"time"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *AgentRepository) definitions() *agentrepository.DefinitionRepository {
	return agentrepository.NewDefinitionRepository(r.db)
}

func (r *AgentRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.definitions().CreateAgent(ctx, agent)
}

func (r *AgentRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.definitions().UpdateAgent(ctx, agent)
}

func (r *AgentRepository) GetAgent(ctx context.Context, id int64) (*domain.Agent, error) {
	return r.definitions().GetAgent(ctx, id)
}

func (r *AgentRepository) ListAgents(ctx context.Context) ([]*domain.Agent, error) {
	return r.definitions().ListAgents(ctx)
}

func (r *AgentRepository) DeleteAgent(ctx context.Context, id int64) error {
	return r.definitions().DeleteAgent(ctx, id)
}

func (r *AgentRepository) SetAgentEnabled(ctx context.Context, id int64, enabled bool, nextRunAt *time.Time) error {
	return r.definitions().SetAgentEnabled(ctx, id, enabled, nextRunAt)
}

func (r *AgentRepository) SetAgentNextRun(ctx context.Context, id int64, nextRunAt *time.Time) error {
	return r.definitions().SetAgentNextRun(ctx, id, nextRunAt)
}

func (r *AgentRepository) ListDueAgents(ctx context.Context, limit int) ([]*domain.Agent, error) {
	return r.definitions().ListDueAgents(ctx, limit)
}
