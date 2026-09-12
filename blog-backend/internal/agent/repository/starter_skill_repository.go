package repository

import (
	"context"
	"database/sql"

	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *SkillRepository) ListSystemStarterSkillsTx(ctx context.Context, tx *sql.Tx) ([]*domain.AgentSkill, error) {
	rows, err := tx.QueryContext(ctx, `SELECT s.system_key, s.name, s.description,
		s.default_daily_run_limit, s.default_monthly_token_budget, sv.id
		FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
		WHERE s.system_key IS NOT NULL AND s.deleted_at IS NULL ORDER BY s.system_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*domain.AgentSkill, 0, 12)
	for rows.Next() {
		var systemKey string
		item := &domain.AgentSkill{}
		if err := rows.Scan(
			&systemKey, &item.Name, &item.Description,
			&item.DefaultDailyRunLimit, &item.DefaultMonthlyTokenBudget, &item.VersionID,
		); err != nil {
			return nil, err
		}
		item.SystemKey = &systemKey
		items = append(items, item)
	}
	return items, rows.Err()
}
