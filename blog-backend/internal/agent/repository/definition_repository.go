package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

type DefinitionRepository struct {
	db *sql.DB
}

func NewDefinitionRepository(db *sql.DB) *DefinitionRepository {
	return &DefinitionRepository{db: db}
}

const agentColumns = `a.id, a.system_key, a.name, a.description, a.provider_profile_id,
	a.skill_version_id, a.enabled, a.trigger_type, a.cron_expression, a.timezone,
	a.max_steps_override, a.max_input_tokens_override, a.max_output_tokens_override, a.daily_run_limit,
	a.monthly_token_budget, a.last_run_at, a.next_run_at, a.created_by_principal_id, a.creation_origin, a.created_at, a.updated_at`

func scanAgent(scanner interface{ Scan(...any) error }) (*domain.Agent, error) {
	var agent domain.Agent
	err := scanner.Scan(
		&agent.ID, &agent.SystemKey, &agent.Name, &agent.Description, &agent.ProviderProfileID,
		&agent.SkillVersionID, &agent.Enabled, &agent.TriggerType, &agent.CronExpression, &agent.Timezone,
		&agent.MaxStepsOverride, &agent.MaxInputTokensOverride, &agent.MaxOutputTokensOverride,
		&agent.DailyRunLimit, &agent.MonthlyTokenBudget, &agent.LastRunAt, &agent.NextRunAt,
		&agent.CreatedByPrincipalID, &agent.CreationOrigin, &agent.CreatedAt, &agent.UpdatedAt,
	)
	return &agent, err
}

func (r *DefinitionRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_agents
		(system_key, name, description, provider_profile_id, skill_version_id, enabled, trigger_type,
		 cron_expression, timezone, max_steps_override, max_input_tokens_override, max_output_tokens_override,
		 daily_run_limit, monthly_token_budget, next_run_at, created_by_principal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING id, created_at, updated_at`,
		agent.SystemKey, agent.Name, agent.Description, agent.ProviderProfileID, agent.SkillVersionID, agent.Enabled,
		agent.TriggerType, agent.CronExpression, agent.Timezone, agent.MaxStepsOverride, agent.MaxInputTokensOverride,
		agent.MaxOutputTokensOverride, agent.DailyRunLimit,
		agent.MonthlyTokenBudget, agent.NextRunAt, agent.CreatedByPrincipalID,
	).Scan(&agent.ID, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *DefinitionRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.db.QueryRowContext(ctx, `UPDATE ai_agents SET
		system_key=$2, name=$3, description=$4, provider_profile_id=$5,
		skill_version_id=$6, enabled=$7, trigger_type=$8, cron_expression=$9, timezone=$10,
		max_steps_override=$11, max_input_tokens_override=$12, max_output_tokens_override=$13,
		daily_run_limit=$14, monthly_token_budget=$15, next_run_at=$16, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING last_run_at, created_at, updated_at`,
		agent.ID, agent.SystemKey, agent.Name, agent.Description, agent.ProviderProfileID,
		agent.SkillVersionID, agent.Enabled, agent.TriggerType, agent.CronExpression, agent.Timezone,
		agent.MaxStepsOverride, agent.MaxInputTokensOverride, agent.MaxOutputTokensOverride,
		agent.DailyRunLimit, agent.MonthlyTokenBudget, agent.NextRunAt,
	).Scan(&agent.LastRunAt, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *DefinitionRepository) GetAgent(ctx context.Context, id int64) (*domain.Agent, error) {
	return scanAgent(r.db.QueryRowContext(ctx, `SELECT `+agentColumns+`
		FROM ai_agents a WHERE a.id=$1 AND a.deleted_at IS NULL`, id))
}

func (r *DefinitionRepository) ListAgents(ctx context.Context) ([]*domain.Agent, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+agentColumns+`
		FROM ai_agents a WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]*domain.Agent, 0)
	for rows.Next() {
		agent, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, agent)
	}
	return result, rows.Err()
}

func (r *DefinitionRepository) DeleteAgent(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_agents SET enabled=false, deleted_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *DefinitionRepository) SetAgentEnabled(ctx context.Context, id int64, enabled bool, nextRunAt *time.Time) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_agents SET enabled=$2, next_run_at=$3, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id, enabled, nextRunAt)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *DefinitionRepository) SetAgentNextRun(ctx context.Context, id int64, nextRunAt *time.Time) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_agents SET next_run_at=$2, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id, nextRunAt)
	return err
}

func (r *DefinitionRepository) ListDueAgents(ctx context.Context, limit int) ([]*domain.Agent, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+agentColumns+`
		FROM ai_agents a
		WHERE a.deleted_at IS NULL AND a.enabled=true AND a.trigger_type='cron'
		  AND a.next_run_at IS NOT NULL AND a.next_run_at <= NOW()
		ORDER BY a.next_run_at LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]*domain.Agent, 0)
	for rows.Next() {
		agent, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, agent)
	}
	return result, rows.Err()
}
