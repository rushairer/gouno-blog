package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

type SkillRepository struct {
	db *sql.DB
}

func NewSkillRepository(db *sql.DB) *SkillRepository {
	return &SkillRepository{db: db}
}

const skillColumns = `s.id, s.system_key, s.name, s.description, s.system_prompt, s.capabilities, s.tool_bindings, s.execution_mode,
	s.content_publish_mode, s.max_steps, s.max_input_tokens, s.max_output_tokens, s.default_daily_run_limit, s.default_monthly_token_budget,
	s.version, COALESCE((SELECT sv.id FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version),0),
	s.input_schema, s.allowed_triggers, s.created_by_principal_id, s.creation_origin, s.created_at, s.updated_at`

func scanSkill(scanner interface{ Scan(...any) error }) (*domain.AgentSkill, error) {
	var skill domain.AgentSkill
	var capabilities, toolBindings, inputSchema, triggers []byte
	err := scanner.Scan(&skill.ID, &skill.SystemKey, &skill.Name, &skill.Description, &skill.SystemPrompt, &capabilities,
		&toolBindings, &skill.ExecutionMode, &skill.ContentPublishMode, &skill.MaxSteps, &skill.MaxInputTokens, &skill.MaxOutputTokens,
		&skill.DefaultDailyRunLimit, &skill.DefaultMonthlyTokenBudget, &skill.Version, &skill.VersionID,
		&inputSchema, &triggers, &skill.CreatedByPrincipalID, &skill.CreationOrigin,
		&skill.CreatedAt, &skill.UpdatedAt)
	if err == nil {
		err = json.Unmarshal(capabilities, &skill.Capabilities)
	}
	if err == nil {
		skill.ToolBindings = toolBindings
		skill.InputSchema = inputSchema
		err = json.Unmarshal(triggers, &skill.AllowedTriggers)
	}
	return &skill, err
}

func (r *SkillRepository) ListSkills(ctx context.Context) ([]*domain.AgentSkill, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+skillColumns+` FROM ai_skills s WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.AgentSkill, 0)
	for rows.Next() {
		skill, err := scanSkill(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, skill)
	}
	return items, rows.Err()
}

func (r *SkillRepository) GetSkill(ctx context.Context, id int64) (*domain.AgentSkill, error) {
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT `+skillColumns+` FROM ai_skills s WHERE s.id=$1 AND s.deleted_at IS NULL`, id))
}

func (r *SkillRepository) CreateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	capabilities, _ := json.Marshal(skill.Capabilities)
	triggers, _ := json.Marshal(skill.AllowedTriggers)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO ai_skills
		(name, description, system_prompt, capabilities, tool_bindings, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, content_publish_mode, created_by_principal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id, version, created_at, updated_at`, skill.Name, skill.Description, skill.SystemPrompt,
		capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens, skill.MaxOutputTokens,
		skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, skill.InputSchema, triggers, skill.ContentPublishMode, skill.CreatedByPrincipalID,
	).Scan(&skill.ID, &skill.Version, &skill.CreatedAt, &skill.UpdatedAt)
	if err == nil {
		err = r.insertSkillVersion(ctx, tx, skill, capabilities, triggers)
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (r *SkillRepository) UpdateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	capabilities, _ := json.Marshal(skill.Capabilities)
	triggers, _ := json.Marshal(skill.AllowedTriggers)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `UPDATE ai_skills SET name=$2, description=$3, system_prompt=$4,
		capabilities=$5, tool_bindings=$6, execution_mode=$7, max_steps=$8, max_input_tokens=$9, max_output_tokens=$10,
		default_daily_run_limit=$11, default_monthly_token_budget=$12, input_schema=$13, allowed_triggers=$14, content_publish_mode=$15,
		version=version+1, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING version, created_at, updated_at`, skill.ID, skill.Name, skill.Description,
		skill.SystemPrompt, capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens,
		skill.MaxOutputTokens, skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, skill.InputSchema, triggers, skill.ContentPublishMode,
	).Scan(&skill.Version, &skill.CreatedAt, &skill.UpdatedAt)
	if err == nil {
		err = r.insertSkillVersion(ctx, tx, skill, capabilities, triggers)
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (r *SkillRepository) insertSkillVersion(ctx context.Context, tx *sql.Tx, skill *domain.AgentSkill, capabilities, triggers []byte) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_skill_versions
		(skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, content_publish_mode, created_by_principal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		skill.ID, skill.Version, skill.SystemPrompt, capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps,
		skill.MaxInputTokens, skill.MaxOutputTokens, skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget,
		skill.InputSchema, triggers, skill.ContentPublishMode, skill.CreatedByPrincipalID).Scan(&skill.VersionID)
}

func (r *SkillRepository) ListSkillVersions(ctx context.Context, skillID int64) ([]*domain.AgentSkill, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT sv.skill_id, s.system_key, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.tool_bindings, sv.execution_mode, sv.content_publish_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.default_daily_run_limit, sv.default_monthly_token_budget, sv.version, sv.id, sv.input_schema,
		sv.allowed_triggers, sv.created_by_principal_id, sv.creation_origin, s.created_at, sv.created_at
		FROM ai_skill_versions sv JOIN ai_skills s ON s.id=sv.skill_id
		WHERE sv.skill_id=$1 ORDER BY sv.version DESC`, skillID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.AgentSkill, 0)
	for rows.Next() {
		item, err := scanSkill(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *SkillRepository) GetSkillVersion(ctx context.Context, versionID int64) (*domain.AgentSkill, error) {
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT sv.skill_id, s.system_key, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.tool_bindings, sv.execution_mode, sv.content_publish_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.default_daily_run_limit, sv.default_monthly_token_budget, sv.version, sv.id, sv.input_schema,
		sv.allowed_triggers, sv.created_by_principal_id, sv.creation_origin, s.created_at, sv.created_at
		FROM ai_skill_versions sv JOIN ai_skills s ON s.id=sv.skill_id WHERE sv.id=$1`, versionID))
}

func (r *SkillRepository) DeleteSkill(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_skills SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
