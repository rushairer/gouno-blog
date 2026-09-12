package repository

import (
	"context"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *AgentRepository) skills() *agentrepository.SkillRepository {
	return agentrepository.NewSkillRepository(r.db)
}

func (r *AgentRepository) ListSkills(ctx context.Context) ([]*domain.AgentSkill, error) {
	return r.skills().ListSkills(ctx)
}

func (r *AgentRepository) GetSkill(ctx context.Context, id int64) (*domain.AgentSkill, error) {
	return r.skills().GetSkill(ctx, id)
}

func (r *AgentRepository) CreateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	return r.skills().CreateSkill(ctx, skill)
}

func (r *AgentRepository) UpdateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	return r.skills().UpdateSkill(ctx, skill)
}

func (r *AgentRepository) ListSkillVersions(ctx context.Context, skillID int64) ([]*domain.AgentSkill, error) {
	return r.skills().ListSkillVersions(ctx, skillID)
}

func (r *AgentRepository) GetSkillVersion(ctx context.Context, versionID int64) (*domain.AgentSkill, error) {
	return r.skills().GetSkillVersion(ctx, versionID)
}

func (r *AgentRepository) DeleteSkill(ctx context.Context, id int64) error {
	return r.skills().DeleteSkill(ctx, id)
}
