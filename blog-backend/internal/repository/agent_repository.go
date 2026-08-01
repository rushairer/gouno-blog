package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

var ErrResourceInUse = errors.New("resource is in use")

type AgentRepository struct {
	db *sql.DB
}

func NewAgentRepository(db *sql.DB) *AgentRepository {
	return &AgentRepository{db: db}
}

const providerColumns = `id, name, provider_type, base_url, model, api_key_ciphertext,
	api_key_nonce, api_key_last4, key_version, enabled, is_default_writing, is_default_image, request_timeout_seconds,
	max_output_tokens, created_at, updated_at`

func scanProvider(scanner interface{ Scan(...any) error }) (*domain.ProviderProfile, error) {
	var profile domain.ProviderProfile
	err := scanner.Scan(
		&profile.ID, &profile.Name, &profile.ProviderType, &profile.BaseURL, &profile.Model,
		&profile.APIKeyCiphertext, &profile.APIKeyNonce, &profile.APIKeyLast4, &profile.KeyVersion,
		&profile.Enabled, &profile.IsDefaultWriting, &profile.IsDefaultImage, &profile.RequestTimeoutSeconds, &profile.MaxOutputTokens,
		&profile.CreatedAt, &profile.UpdatedAt,
	)
	profile.HasAPIKey = len(profile.APIKeyCiphertext) > 0
	return &profile, err
}

func (r *AgentRepository) CreateProvider(ctx context.Context, profile *domain.ProviderProfile) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_provider_profiles
		(name, provider_type, base_url, model, api_key_ciphertext, api_key_nonce, api_key_last4,
		 key_version, enabled, request_timeout_seconds, max_output_tokens)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, created_at, updated_at`,
		profile.Name, profile.ProviderType, profile.BaseURL, profile.Model, profile.APIKeyCiphertext,
		profile.APIKeyNonce, profile.APIKeyLast4, profile.KeyVersion, profile.Enabled,
		profile.RequestTimeoutSeconds, profile.MaxOutputTokens,
	).Scan(&profile.ID, &profile.CreatedAt, &profile.UpdatedAt)
}

func (r *AgentRepository) UpdateProvider(ctx context.Context, profile *domain.ProviderProfile, replaceSecret bool) error {
	var row *sql.Row
	if replaceSecret {
		row = r.db.QueryRowContext(ctx, `UPDATE ai_provider_profiles SET
			name=$2, provider_type=$3, base_url=$4, model=$5, api_key_ciphertext=$6,
			api_key_nonce=$7, api_key_last4=$8, key_version=$9, enabled=$10,
			request_timeout_seconds=$11, max_output_tokens=$12, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING created_at, updated_at`,
			profile.ID, profile.Name, profile.ProviderType, profile.BaseURL, profile.Model,
			profile.APIKeyCiphertext, profile.APIKeyNonce, profile.APIKeyLast4, profile.KeyVersion,
			profile.Enabled, profile.RequestTimeoutSeconds, profile.MaxOutputTokens)
	} else {
		row = r.db.QueryRowContext(ctx, `UPDATE ai_provider_profiles SET
			name=$2, provider_type=$3, base_url=$4, model=$5, enabled=$6,
			request_timeout_seconds=$7, max_output_tokens=$8, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL
			RETURNING api_key_ciphertext, api_key_nonce, api_key_last4, key_version, created_at, updated_at`,
			profile.ID, profile.Name, profile.ProviderType, profile.BaseURL, profile.Model,
			profile.Enabled, profile.RequestTimeoutSeconds, profile.MaxOutputTokens)
		return row.Scan(
			&profile.APIKeyCiphertext, &profile.APIKeyNonce, &profile.APIKeyLast4,
			&profile.KeyVersion, &profile.CreatedAt, &profile.UpdatedAt,
		)
	}
	return row.Scan(&profile.CreatedAt, &profile.UpdatedAt)
}

func (r *AgentRepository) GetProvider(ctx context.Context, id int64) (*domain.ProviderProfile, error) {
	return scanProvider(r.db.QueryRowContext(ctx, `SELECT `+providerColumns+`
		FROM ai_provider_profiles WHERE id=$1 AND deleted_at IS NULL`, id))
}

func (r *AgentRepository) ListProviders(ctx context.Context) ([]*domain.ProviderProfile, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+providerColumns+`
		FROM ai_provider_profiles WHERE deleted_at IS NULL ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]*domain.ProviderProfile, 0)
	for rows.Next() {
		profile, err := scanProvider(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, profile)
	}
	return result, rows.Err()
}

func (r *AgentRepository) SetDefaultProvider(ctx context.Context, id int64, purpose string) error {
	column := "is_default_writing"
	if purpose == "image" {
		column = "is_default_image"
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_provider_profiles SET `+column+`=false, updated_at=NOW() WHERE deleted_at IS NULL AND `+column+`=true`); err == nil {
		result, updateErr := tx.ExecContext(ctx, `UPDATE ai_provider_profiles SET `+column+`=true, updated_at=NOW() WHERE id=$1 AND enabled=true AND deleted_at IS NULL`, id)
		err = updateErr
		if err == nil {
			affected, _ := result.RowsAffected()
			if affected == 0 {
				err = sql.ErrNoRows
			}
		}
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (r *AgentRepository) DeleteProvider(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_provider_profiles p
		SET enabled=false, api_key_ciphertext=NULL, api_key_nonce=NULL,
			api_key_last4='', key_version=0, deleted_at=NOW(), updated_at=NOW()
		WHERE p.id=$1 AND p.deleted_at IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM ai_agents a
			WHERE a.provider_profile_id=p.id AND a.deleted_at IS NULL
		)`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		var exists bool
		if err := r.db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM ai_provider_profiles WHERE id=$1 AND deleted_at IS NULL
		)`, id).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return ErrResourceInUse
		}
		return sql.ErrNoRows
	}
	return nil
}

const agentColumns = `a.id, a.name, a.description, a.system_prompt, a.provider_profile_id,
	a.skill_version_id, a.enabled, a.trigger_type, a.cron_expression, a.timezone, a.capabilities, a.execution_mode,
	a.max_steps, a.max_input_tokens, a.max_output_tokens, a.daily_run_limit,
	a.monthly_token_budget, a.last_run_at, a.next_run_at, a.created_by, a.created_at, a.updated_at`

func scanAgent(scanner interface{ Scan(...any) error }) (*domain.Agent, error) {
	var agent domain.Agent
	var capabilities []byte
	err := scanner.Scan(
		&agent.ID, &agent.Name, &agent.Description, &agent.SystemPrompt, &agent.ProviderProfileID,
		&agent.SkillVersionID, &agent.Enabled, &agent.TriggerType, &agent.CronExpression, &agent.Timezone, &capabilities,
		&agent.ExecutionMode, &agent.MaxSteps, &agent.MaxInputTokens, &agent.MaxOutputTokens,
		&agent.DailyRunLimit, &agent.MonthlyTokenBudget, &agent.LastRunAt, &agent.NextRunAt,
		&agent.CreatedBy, &agent.CreatedAt, &agent.UpdatedAt,
	)
	if err == nil {
		err = json.Unmarshal(capabilities, &agent.Capabilities)
	}
	return &agent, err
}

func (r *AgentRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
	capabilities, _ := json.Marshal(agent.Capabilities)
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_agents
		(name, description, system_prompt, provider_profile_id, skill_version_id, enabled, trigger_type,
		 cron_expression, timezone, capabilities, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, daily_run_limit, monthly_token_budget, next_run_at, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		RETURNING id, created_at, updated_at`,
		agent.Name, agent.Description, agent.SystemPrompt, agent.ProviderProfileID, agent.SkillVersionID, agent.Enabled,
		agent.TriggerType, agent.CronExpression, agent.Timezone, capabilities, agent.ExecutionMode,
		agent.MaxSteps, agent.MaxInputTokens, agent.MaxOutputTokens, agent.DailyRunLimit,
		agent.MonthlyTokenBudget, agent.NextRunAt, agent.CreatedBy,
	).Scan(&agent.ID, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *AgentRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
	capabilities, _ := json.Marshal(agent.Capabilities)
	return r.db.QueryRowContext(ctx, `UPDATE ai_agents SET
		name=$2, description=$3, system_prompt=$4, provider_profile_id=$5,
		skill_version_id=$6, enabled=$7, trigger_type=$8, cron_expression=$9, timezone=$10, capabilities=$11,
		execution_mode=$12, max_steps=$13, max_input_tokens=$14, max_output_tokens=$15,
		daily_run_limit=$16, monthly_token_budget=$17, next_run_at=$18, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING last_run_at, created_by, created_at, updated_at`,
		agent.ID, agent.Name, agent.Description, agent.SystemPrompt, agent.ProviderProfileID,
		agent.SkillVersionID, agent.Enabled, agent.TriggerType, agent.CronExpression, agent.Timezone, capabilities,
		agent.ExecutionMode, agent.MaxSteps, agent.MaxInputTokens, agent.MaxOutputTokens,
		agent.DailyRunLimit, agent.MonthlyTokenBudget, agent.NextRunAt,
	).Scan(&agent.LastRunAt, &agent.CreatedBy, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *AgentRepository) GetAgent(ctx context.Context, id int64) (*domain.Agent, error) {
	return scanAgent(r.db.QueryRowContext(ctx, `SELECT `+agentColumns+`
		FROM ai_agents a WHERE a.id=$1 AND a.deleted_at IS NULL`, id))
}

func (r *AgentRepository) ListAgents(ctx context.Context) ([]*domain.Agent, error) {
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

const skillColumns = `s.id, s.name, s.description, s.system_prompt, s.capabilities, s.execution_mode,
	s.max_steps, s.max_input_tokens, s.max_output_tokens, s.daily_run_limit, s.monthly_token_budget,
	s.version, COALESCE((SELECT sv.id FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version),0),
	s.input_schema, s.allowed_triggers, s.created_by, s.created_at, s.updated_at`

func scanSkill(scanner interface{ Scan(...any) error }) (*domain.AgentSkill, error) {
	var skill domain.AgentSkill
	var capabilities, inputSchema, triggers []byte
	err := scanner.Scan(&skill.ID, &skill.Name, &skill.Description, &skill.SystemPrompt, &capabilities,
		&skill.ExecutionMode, &skill.MaxSteps, &skill.MaxInputTokens, &skill.MaxOutputTokens,
		&skill.DailyRunLimit, &skill.MonthlyTokenBudget, &skill.Version, &skill.VersionID,
		&inputSchema, &triggers, &skill.CreatedBy,
		&skill.CreatedAt, &skill.UpdatedAt)
	if err == nil {
		err = json.Unmarshal(capabilities, &skill.Capabilities)
	}
	if err == nil {
		skill.InputSchema = inputSchema
		err = json.Unmarshal(triggers, &skill.AllowedTriggers)
	}
	return &skill, err
}

func (r *AgentRepository) ListSkills(ctx context.Context) ([]*domain.AgentSkill, error) {
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

func (r *AgentRepository) GetSkill(ctx context.Context, id int64) (*domain.AgentSkill, error) {
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT `+skillColumns+` FROM ai_skills s WHERE s.id=$1 AND s.deleted_at IS NULL`, id))
}

func (r *AgentRepository) CreateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	capabilities, _ := json.Marshal(skill.Capabilities)
	triggers, _ := json.Marshal(skill.AllowedTriggers)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO ai_skills
		(name, description, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, version, created_at, updated_at`, skill.Name, skill.Description, skill.SystemPrompt,
		capabilities, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens, skill.MaxOutputTokens,
		skill.DailyRunLimit, skill.MonthlyTokenBudget, skill.InputSchema, triggers, skill.CreatedBy,
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

func (r *AgentRepository) UpdateSkill(ctx context.Context, skill *domain.AgentSkill) error {
	capabilities, _ := json.Marshal(skill.Capabilities)
	triggers, _ := json.Marshal(skill.AllowedTriggers)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `UPDATE ai_skills SET name=$2, description=$3, system_prompt=$4,
		capabilities=$5, execution_mode=$6, max_steps=$7, max_input_tokens=$8, max_output_tokens=$9,
		daily_run_limit=$10, monthly_token_budget=$11, input_schema=$12, allowed_triggers=$13,
		version=version+1, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING version, created_by, created_at, updated_at`, skill.ID, skill.Name, skill.Description,
		skill.SystemPrompt, capabilities, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens,
		skill.MaxOutputTokens, skill.DailyRunLimit, skill.MonthlyTokenBudget, skill.InputSchema, triggers,
	).Scan(&skill.Version, &skill.CreatedBy, &skill.CreatedAt, &skill.UpdatedAt)
	if err == nil {
		err = r.insertSkillVersion(ctx, tx, skill, capabilities, triggers)
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (r *AgentRepository) insertSkillVersion(ctx context.Context, tx *sql.Tx, skill *domain.AgentSkill, capabilities, triggers []byte) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_skill_versions
		(skill_id, version, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		skill.ID, skill.Version, skill.SystemPrompt, capabilities, skill.ExecutionMode, skill.MaxSteps,
		skill.MaxInputTokens, skill.MaxOutputTokens, skill.DailyRunLimit, skill.MonthlyTokenBudget,
		skill.InputSchema, triggers, skill.CreatedBy).Scan(&skill.VersionID)
}

func (r *AgentRepository) ListSkillVersions(ctx context.Context, skillID int64) ([]*domain.AgentSkill, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT sv.skill_id, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.execution_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.daily_run_limit, sv.monthly_token_budget, sv.version, sv.id, sv.input_schema,
		sv.allowed_triggers, sv.created_by, s.created_at, sv.created_at
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

func (r *AgentRepository) GetSkillVersion(ctx context.Context, versionID int64) (*domain.AgentSkill, error) {
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT sv.skill_id, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.execution_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.daily_run_limit, sv.monthly_token_budget, sv.version, sv.id, sv.input_schema,
		sv.allowed_triggers, sv.created_by, s.created_at, sv.created_at
		FROM ai_skill_versions sv JOIN ai_skills s ON s.id=sv.skill_id WHERE sv.id=$1`, versionID))
}

func (r *AgentRepository) DeleteSkill(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_skills SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) DeleteAgent(ctx context.Context, id int64) error {
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

func (r *AgentRepository) SetAgentEnabled(ctx context.Context, id int64, enabled bool, nextRunAt *time.Time) error {
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

func (r *AgentRepository) SetAgentNextRun(ctx context.Context, id int64, nextRunAt *time.Time) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_agents SET next_run_at=$2, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id, nextRunAt)
	return err
}

func (r *AgentRepository) ListDueAgents(ctx context.Context, limit int) ([]*domain.Agent, error) {
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

const runColumns = `r.id, r.agent_id, r.trigger_type, r.triggered_by, r.schedule_key, r.status,
	r.input, r.output_summary, r.provider, r.model, r.input_tokens, r.output_tokens,
	r.error_code, r.error_message, r.started_at, r.finished_at, r.created_at, r.citations,
	r.skill_version_id, r.workflow_version_id`

func scanRun(scanner interface{ Scan(...any) error }) (*domain.AgentRun, error) {
	var run domain.AgentRun
	var citations []byte
	err := scanner.Scan(
		&run.ID, &run.AgentID, &run.TriggerType, &run.TriggeredBy, &run.ScheduleKey, &run.Status,
		&run.Input, &run.OutputSummary, &run.Provider, &run.Model, &run.InputTokens,
		&run.OutputTokens, &run.ErrorCode, &run.ErrorMessage, &run.StartedAt, &run.FinishedAt,
		&run.CreatedAt, &citations, &run.SkillVersionID, &run.WorkflowVersionID,
	)
	if err == nil {
		err = json.Unmarshal(citations, &run.Citations)
	}
	return &run, err
}

func (r *AgentRepository) CreateRun(ctx context.Context, run *domain.AgentRun) error {
	if len(run.Input) == 0 {
		run.Input = json.RawMessage(`{}`)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id, trigger_type, triggered_by, schedule_key, status, input, provider, model, skill_version_id, workflow_version_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, created_at`,
		run.AgentID, run.TriggerType, run.TriggeredBy, run.ScheduleKey, run.Status, run.Input,
		run.Provider, run.Model, run.SkillVersionID, run.WorkflowVersionID,
	).Scan(&run.ID, &run.CreatedAt)
}

func (r *AgentRepository) StartRun(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs
		SET status='running', started_at=NOW()
		WHERE id=$1 AND status='queued'`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) FinishRun(ctx context.Context, id int64, status domain.AgentRunStatus, summary string, inputTokens, outputTokens int64, errorCode, errorMessage *string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET
		status=$2, output_summary=$3, input_tokens=$4, output_tokens=$5,
		error_code=$6, error_message=$7, finished_at=NOW()
		WHERE id=$1`, id, status, summary, inputTokens, outputTokens, errorCode, errorMessage)
	return err
}

func (r *AgentRepository) SaveRunCitations(ctx context.Context, id int64, citations []domain.AgentCitation) error {
	raw, err := json.Marshal(citations)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET citations=$2 WHERE id=$1`, id, raw)
	return err
}

func (r *AgentRepository) GetRun(ctx context.Context, id int64) (*domain.AgentRun, error) {
	return scanRun(r.db.QueryRowContext(ctx, `SELECT `+runColumns+` FROM ai_agent_runs r WHERE r.id=$1`, id))
}

func (r *AgentRepository) ListRuns(ctx context.Context, agentID int64, limit, offset int) ([]*domain.AgentRun, int, error) {
	where := ""
	args := []any{limit, offset}
	countQuery := `SELECT COUNT(*) FROM ai_agent_runs r`
	countArgs := []any{}
	if agentID > 0 {
		where = " WHERE r.agent_id=$3"
		args = append(args, agentID)
		countQuery += " WHERE r.agent_id=$1"
		countArgs = append(countArgs, agentID)
	}
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+runColumns+` FROM ai_agent_runs r`+where+`
		ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := make([]*domain.AgentRun, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, 0, err
		}
		result = append(result, run)
	}
	return result, total, rows.Err()
}

func (r *AgentRepository) DailyRunCount(ctx context.Context, agentID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agent_runs
		WHERE agent_id=$1 AND created_at >= date_trunc('day', NOW())`, agentID).Scan(&count)
	return count, err
}

func (r *AgentRepository) MonthlyTokenUsage(ctx context.Context, agentID int64) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
		FROM ai_agent_runs WHERE agent_id=$1 AND created_at >= date_trunc('month', NOW())
		AND status IN ('succeeded', 'awaiting_approval')`, agentID).Scan(&total)
	return total, err
}

func (r *AgentRepository) CreateToolCall(ctx context.Context, call *domain.AgentToolCall) error {
	if len(call.Arguments) == 0 {
		call.Arguments = json.RawMessage(`{}`)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id, provider_call_id, tool_name, risk_level, arguments, status, started_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, created_at`,
		call.RunID, call.ProviderCallID, call.ToolName, call.RiskLevel, call.Arguments, call.Status,
	).Scan(&call.ID, &call.CreatedAt)
}

func (r *AgentRepository) CreateToolCallTx(ctx context.Context, tx *sql.Tx, call *domain.AgentToolCall) error {
	if len(call.Arguments) == 0 {
		call.Arguments = json.RawMessage(`{}`)
	}
	return tx.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,provider_call_id,tool_name,risk_level,arguments,status,started_at,finished_at)
		VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id,created_at`,
		call.RunID, call.ProviderCallID, call.ToolName, call.RiskLevel, call.Arguments, call.Status).Scan(&call.ID, &call.CreatedAt)
}

func (r *AgentRepository) FinishToolCall(ctx context.Context, id int64, status domain.ToolCallStatus, result json.RawMessage, errorMessage *string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_tool_calls SET
		status=$2, result=$3, error_message=$4, finished_at=NOW() WHERE id=$1`,
		id, status, nullableJSON(result), errorMessage)
	return err
}

func nullableJSON(value json.RawMessage) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func (r *AgentRepository) ListToolCalls(ctx context.Context, runID int64) ([]*domain.AgentToolCall, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, run_id, provider_call_id, tool_name, risk_level,
		arguments, result, status, error_message, started_at, finished_at, created_at
		FROM ai_tool_calls WHERE run_id=$1 ORDER BY created_at`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]*domain.AgentToolCall, 0)
	for rows.Next() {
		var call domain.AgentToolCall
		var rawResult []byte
		if err := rows.Scan(
			&call.ID, &call.RunID, &call.ProviderCallID, &call.ToolName, &call.RiskLevel,
			&call.Arguments, &rawResult, &call.Status, &call.ErrorMessage, &call.StartedAt,
			&call.FinishedAt, &call.CreatedAt,
		); err != nil {
			return nil, err
		}
		call.Result = rawResult
		result = append(result, &call)
	}
	return result, rows.Err()
}

func (r *AgentRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id, tool_call_id, action_type, target_type, target_id, proposed_payload, before_snapshot)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, status, expires_at, created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType,
		approval.TargetID, approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot),
	).Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *AgentRepository) CreateApprovalTx(ctx context.Context, tx *sql.Tx, approval *domain.AgentApproval) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,target_id,proposed_payload,before_snapshot)
		VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,expires_at,created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType, approval.TargetID,
		approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot)).
		Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *AgentRepository) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error {
	var payload struct {
		PostID     int64                     `json:"post_id"`
		FieldType  string                    `json:"field_type"`
		Candidates []domain.ContentCandidate `json:"candidates"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return err
	}
	if payload.PostID <= 0 && approval.TargetID != nil {
		payload.PostID = *approval.TargetID
	}
	if payload.PostID <= 0 || len(payload.Candidates) == 0 {
		return errors.New("content candidate proposal requires a post and at least one candidate")
	}
	var before domain.Post
	if err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil {
		return err
	}
	beforeValue := ""
	switch payload.FieldType {
	case "title":
		beforeValue = before.Title
	case "summary":
		beforeValue = before.Summary
	case "cover_alt":
		beforeValue = before.CoverAlt
	default:
		return errors.New("unsupported candidate field")
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	var setID int64
	if err = tx.QueryRowContext(ctx, `INSERT INTO ai_content_candidate_sets
		(post_id,source_run_id,source_approval_id,field_type,before_value)
		VALUES($1,$2,$3,$4,$5) RETURNING id`, payload.PostID, approval.RunID, approval.ID, payload.FieldType, beforeValue).Scan(&setID); err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, item := range payload.Candidates {
		if _, err = tx.ExecContext(ctx, `INSERT INTO ai_content_candidates
		(candidate_set_id,value,rationale)VALUES($1,$2,$3)`, setID, item.Value, item.Rationale); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

const approvalColumns = `ap.id, ap.run_id, ap.tool_call_id, ap.action_type, ap.target_type,
	ap.target_id, ap.proposed_payload, ap.before_snapshot, ap.status, ap.reviewed_by,
	ap.review_note, ap.reviewed_at, ap.expires_at, ap.created_at`

func scanApproval(scanner interface{ Scan(...any) error }) (*domain.AgentApproval, error) {
	var approval domain.AgentApproval
	var before []byte
	err := scanner.Scan(
		&approval.ID, &approval.RunID, &approval.ToolCallID, &approval.ActionType,
		&approval.TargetType, &approval.TargetID, &approval.ProposedPayload, &before,
		&approval.Status, &approval.ReviewedBy, &approval.ReviewNote, &approval.ReviewedAt,
		&approval.ExpiresAt, &approval.CreatedAt,
	)
	approval.BeforeSnapshot = before
	return &approval, err
}

func (r *AgentRepository) GetApproval(ctx context.Context, id int64) (*domain.AgentApproval, error) {
	return scanApproval(r.db.QueryRowContext(ctx, `SELECT `+approvalColumns+`
		FROM ai_approvals ap WHERE ap.id=$1`, id))
}

func (r *AgentRepository) ListApprovals(ctx context.Context, status string, limit, offset int) ([]*domain.AgentApproval, int, error) {
	where := ""
	args := []any{limit, offset}
	countQuery := `SELECT COUNT(*) FROM ai_approvals ap`
	countArgs := []any{}
	if status != "" && status != "all" {
		where = " WHERE ap.status=$3"
		args = append(args, status)
		countQuery += " WHERE ap.status=$1"
		countArgs = append(countArgs, status)
	}
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+approvalColumns+`
		FROM ai_approvals ap`+where+` ORDER BY ap.created_at DESC LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := make([]*domain.AgentApproval, 0)
	for rows.Next() {
		approval, err := scanApproval(rows)
		if err != nil {
			return nil, 0, err
		}
		result = append(result, approval)
	}
	return result, total, rows.Err()
}

func (r *AgentRepository) ClaimApproval(ctx context.Context, id int64, reviewer, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='approved', reviewed_by=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status='pending' AND expires_at > NOW()`, id, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) CompleteApproval(ctx context.Context, id int64, status domain.ApprovalStatus, note string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET status=$2,
		review_note=CASE WHEN $3='' THEN review_note ELSE $3 END WHERE id=$1`, id, status, note)
	return err
}

func (r *AgentRepository) RejectApproval(ctx context.Context, id int64, reviewer, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='rejected', reviewed_by=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status='pending'`, id, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) CreateEditorialTask(ctx context.Context, approvalID int64, title, description, priority string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
		(title, description, priority, source_approval_id) VALUES ($1,$2,$3,$4)`,
		title, description, priority, approvalID)
	return err
}

func (r *AgentRepository) CreateOperationalSuggestion(ctx context.Context, value *domain.OperationalSuggestion) error {
	sum := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join([]string{value.SourceType, value.SourceKey, value.Title}, ":"))))
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_operational_suggestions
		(source_type,source_key,source_run_id,workflow_run_id,title,description,priority,evidence,
		 window_start,window_end,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT(dedupe_key) DO UPDATE SET evidence=EXCLUDED.evidence,updated_at=NOW()
		WHERE ai_operational_suggestions.status='new'`, value.SourceType, value.SourceKey, value.SourceRunID,
		value.WorkflowRunID, value.Title, value.Description, value.Priority, value.Evidence, value.WindowStart, value.WindowEnd, sum)
	return err
}

func (r *AgentRepository) CreateReplyDraft(ctx context.Context, approvalID, commentID int64, content string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_comment_reply_drafts
		(comment_id, content, source_approval_id) VALUES ($1,$2,$3)`,
		commentID, content, approvalID)
	return err
}

func (r *AgentRepository) CreateMediaCandidate(ctx context.Context, approval *domain.AgentApproval) error {
	var payload struct {
		PostID   int64  `json:"post_id"`
		Format   string `json:"format"`
		Headline string `json:"headline"`
		Body     string `json:"body"`
		Platform string `json:"platform"`
		AltText  string `json:"alt_text"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return err
	}
	if payload.PostID <= 0 || payload.Format != "image_brief" || strings.TrimSpace(payload.Body) == "" {
		return errors.New("invalid media candidate")
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_media_candidates
		(post_id,source_run_id,source_approval_id,headline,brief,platform,alt_text,provider,model,input_tokens,output_tokens)
		SELECT $1,$2,$3,$4,$5,$6,$7,ar.provider,ar.model,ar.input_tokens,ar.output_tokens FROM ai_agent_runs ar WHERE ar.id=$2`,
		payload.PostID, approval.RunID, approval.ID, strings.TrimSpace(payload.Headline), strings.TrimSpace(payload.Body), strings.TrimSpace(payload.Platform), strings.TrimSpace(payload.AltText))
	return err
}

func (r *AgentRepository) ListMediaCandidates(ctx context.Context) ([]*domain.MediaCandidate, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,post_id,source_run_id,source_approval_id,headline,brief,platform,provider,model,input_tokens,output_tokens,media_asset_id,
		generation_status,safety_status,copyright_status,alt_text,reviewed_by,review_note,reviewed_at,created_at
		FROM ai_media_candidates ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.MediaCandidate, 0)
	for rows.Next() {
		var item domain.MediaCandidate
		if err := rows.Scan(&item.ID, &item.PostID, &item.SourceRunID, &item.SourceApprovalID, &item.Headline,
			&item.Brief, &item.Platform, &item.Provider, &item.Model, &item.InputTokens, &item.OutputTokens, &item.MediaAssetID, &item.GenerationStatus,
			&item.SafetyStatus, &item.CopyrightStatus, &item.AltText, &item.ReviewedBy, &item.ReviewNote,
			&item.ReviewedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *AgentRepository) AttachMediaAsset(ctx context.Context, candidateID, mediaAssetID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET media_asset_id=$2,generation_status='generated'
		WHERE id=$1 AND generation_status='ready_to_generate'
		AND EXISTS (SELECT 1 FROM media_assets WHERE id=$2)`, candidateID, mediaAssetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ClaimMediaGeneration atomically prevents duplicate administrator clicks from
// issuing multiple billable image requests for the same reviewed brief.
func (r *AgentRepository) ClaimMediaGeneration(ctx context.Context, id int64) (*domain.MediaCandidate, error) {
	var item domain.MediaCandidate
	err := r.db.QueryRowContext(ctx, `UPDATE ai_media_candidates SET generation_status='generating'
		WHERE id=$1 AND generation_status='ready_to_generate'
		RETURNING id,post_id,source_run_id,source_approval_id,headline,brief,platform,provider,model,input_tokens,output_tokens,media_asset_id,
		generation_status,safety_status,copyright_status,alt_text,reviewed_by,review_note,reviewed_at,created_at`, id).Scan(
		&item.ID, &item.PostID, &item.SourceRunID, &item.SourceApprovalID, &item.Headline, &item.Brief, &item.Platform,
		&item.Provider, &item.Model, &item.InputTokens, &item.OutputTokens, &item.MediaAssetID, &item.GenerationStatus,
		&item.SafetyStatus, &item.CopyrightStatus, &item.AltText, &item.ReviewedBy, &item.ReviewNote, &item.ReviewedAt, &item.CreatedAt)
	return &item, err
}

func (r *AgentRepository) CompleteMediaGeneration(ctx context.Context, candidateID, mediaAssetID int64, failed bool) error {
	status := "generated"
	if failed {
		status = "failed"
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status=$2, media_asset_id=CASE WHEN $3 > 0 THEN $3 ELSE media_asset_id END
		WHERE id=$1 AND generation_status='generating'`, candidateID, status, mediaAssetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) ReviewMediaCandidate(ctx context.Context, id int64, action, reviewer, note string) error {
	status, safety, copyright := "", "", ""
	switch action {
	case "ready":
		status, safety, copyright = "ready_to_generate", "passed", "passed"
	case "reject":
		status, safety, copyright = "rejected", "flagged", "flagged"
	default:
		return errors.New("invalid media candidate review")
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status=$2,safety_status=$3,
		copyright_status=$4,reviewed_by=$5,review_note=$6,reviewed_at=NOW()
		WHERE id=$1 AND generation_status='brief_ready'`, id, status, safety, copyright, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) RecordUsage(ctx context.Context, event *domain.UsageEvent) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_usage_events
		(run_id, request_id, provider, model, input_tokens, output_tokens, completed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		event.RunID, event.RequestID, event.Provider, event.Model, event.InputTokens,
		event.OutputTokens, event.CompletedAt,
	).Scan(&event.ID)
}

func IsConstraintError(err error) bool {
	if err == nil {
		return false
	}
	var target interface{ SQLState() string }
	return errors.As(err, &target) && (target.SQLState() == "23505" || target.SQLState() == "23503" || target.SQLState() == "23514")
}

func WrapNotFound(name string, err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%s not found: %w", name, err)
	}
	return err
}
