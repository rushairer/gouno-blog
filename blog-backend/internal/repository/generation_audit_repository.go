package repository

import (
	"context"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *AgentRepository) generationAudits() *agentrepository.GenerationAuditRepository {
	return agentrepository.NewGenerationAuditRepository(r.db)
}

func (r *AgentRepository) RecordGenerationAudit(ctx context.Context, value *domain.GenerationAudit) error {
	return r.generationAudits().RecordGenerationAudit(ctx, value)
}
