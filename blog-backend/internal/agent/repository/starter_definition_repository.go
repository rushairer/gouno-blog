package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *DefinitionRepository) ReconcileSystemAgentTx(ctx context.Context, tx *sql.Tx, skill *domain.AgentSkill) (int64, bool, error) {
	if skill == nil || skill.SystemKey == nil || *skill.SystemKey == "" {
		return 0, false, fmt.Errorf("system Skill key is required")
	}

	var agentID int64
	err := tx.QueryRowContext(ctx, `INSERT INTO ai_agents
		(system_key,name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget,creation_origin)
		VALUES ($1,$2,$3,NULL,$4,FALSE,'manual','Asia/Shanghai',$5,$6,$7)
		ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING
		RETURNING id`, *skill.SystemKey, skill.Name, skill.Description, skill.VersionID,
		skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, "system").Scan(&agentID)
	if err == nil {
		return agentID, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	err = tx.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE system_key=$1 AND deleted_at IS NULL`, *skill.SystemKey).Scan(&agentID)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `UPDATE ai_agents
			SET deleted_at=NULL, skill_version_id=$2, updated_at=NOW()
			WHERE system_key=$1 RETURNING id`, *skill.SystemKey, skill.VersionID).Scan(&agentID)
	}
	return agentID, false, err
}
