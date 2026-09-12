package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
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

// RecordGenerationAudit deliberately stores no prompt, generated text, or
// binary media. Generation failures must not hide the primary user result, so
// callers treat a storage error as best-effort.
func (r *AgentRepository) RecordGenerationAudit(ctx context.Context, value *domain.GenerationAudit) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,agent_run_id,workflow_run_id,media_candidate_id,media_asset_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		value.Source, value.Operation, value.TemplateVersion, value.Provider, value.Model, value.InputTokens, value.OutputTokens,
		value.Status, value.ErrorCode, value.AgentRunID, value.WorkflowRunID, value.MediaCandidateID, value.MediaAssetID).Scan(&value.ID)
}

const starterPackVersion = 4

func sameJSON(left, right []byte) bool {
	var leftValue, rightValue any
	return json.Unmarshal(left, &leftValue) == nil && json.Unmarshal(right, &rightValue) == nil && reflect.DeepEqual(leftValue, rightValue)
}

// BootstrapStarterPack reconciles the system deployment after a usable Provider
// exists. The singleton row serializes concurrent Provider saves, while the
// unique system keys make partial initialization recoverable.
func (r *AgentRepository) BootstrapStarterPack(ctx context.Context) (int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var providerID int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM ai_provider_profiles
		WHERE enabled=TRUE AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
		ORDER BY is_default_writing DESC, created_at ASC LIMIT 1`).Scan(&providerID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, tx.Commit()
	}
	if err != nil {
		return 0, err
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO ai_workspace_bootstrap (singleton, version, provider_profile_id)
		VALUES (TRUE,$1,$2)
		ON CONFLICT (singleton) DO UPDATE SET version=ai_workspace_bootstrap.version
		RETURNING version`, starterPackVersion, providerID).Scan(new(int))
	if err != nil {
		return 0, err
	}

	rows, err := tx.QueryContext(ctx, `SELECT s.system_key, s.name, s.description,
		s.default_daily_run_limit, s.default_monthly_token_budget, sv.id
		FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
		WHERE s.system_key IS NOT NULL AND s.deleted_at IS NULL ORDER BY s.system_key`)
	if err != nil {
		return 0, err
	}
	type starterSkill struct {
		systemKey, name, description  string
		dailyLimit                    int
		monthlyBudget, skillVersionID int64
	}
	items := make([]starterSkill, 0, 12)
	for rows.Next() {
		var item starterSkill
		if err := rows.Scan(&item.systemKey, &item.name, &item.description, &item.dailyLimit, &item.monthlyBudget, &item.skillVersionID); err != nil {
			return 0, err
		}
		items = append(items, item)
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(items) == 0 {
		return 0, fmt.Errorf("starter pack is incomplete: no system Skills found")
	}
	workflowApproval := map[string]bool{"stale_content_refresh": true}
	workflowAgents := make(map[string]int64, 4)
	systemAgents := make(map[string]int64, len(items))
	created := 0
	for _, item := range items {
		var agentID int64
		err := tx.QueryRowContext(ctx, `INSERT INTO ai_agents
			(system_key,name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget,creation_origin)
			VALUES ($1,$2,$3,NULL,$4,FALSE,'manual','Asia/Shanghai',$5,$6,$7)
			ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING
			RETURNING id`, item.systemKey, item.name, item.description, item.skillVersionID, item.dailyLimit, item.monthlyBudget, "system").Scan(&agentID)
		if errors.Is(err, sql.ErrNoRows) {
			err = tx.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE system_key=$1 AND deleted_at IS NULL`, item.systemKey).Scan(&agentID)
			if errors.Is(err, sql.ErrNoRows) {
				err = tx.QueryRowContext(ctx, `UPDATE ai_agents
					SET deleted_at=NULL, skill_version_id=$2, updated_at=NOW()
					WHERE system_key=$1 RETURNING id`, item.systemKey, item.skillVersionID).Scan(&agentID)
			}
		} else if err == nil {
			created++
		}
		if err != nil {
			return 0, err
		}
		systemAgents[item.systemKey] = agentID
		if _, ok := workflowApproval[item.systemKey]; ok {
			workflowAgents[item.systemKey] = agentID
		} else if item.systemKey == "daily_news" || item.systemKey == "weekly_operations" || item.systemKey == "low_engagement" {
			workflowAgents[item.systemKey] = agentID
		}
	}
	if len(workflowAgents) != 4 {
		return 0, fmt.Errorf("starter workflow Agent bindings are incomplete")
	}
	starterWorkflowMeta := map[string]struct {
		name           string
		description    string
		cronExpression string
	}{
		"daily_news": {
			name:           "AI 每日资讯",
			description:    "每天 09:00 调度 AI 每日资讯 Agent。",
			cronExpression: "0 9 * * *",
		},
		"weekly_operations": {
			name:           "周度运营复盘",
			description:    "每周调度周度运营复盘 Agent。",
			cronExpression: "0 9 * * 1",
		},
		"stale_content_refresh": {
			name:           "陈旧内容更新",
			description:    "定期调度陈旧内容更新 Agent。",
			cronExpression: "0 9 * * 2",
		},
		"low_engagement": {
			name:           "低互动文章分析",
			description:    "定期调度低互动文章分析 Agent。",
			cronExpression: "0 9 * * 3",
		},
	}
	for key, agentID := range workflowAgents {
		steps, _ := json.Marshal([]map[string]any{{"id": "agent", "type": "model", "agent_id": agentID}})
		if workflowApproval[key] {
			steps, _ = json.Marshal([]map[string]any{{"id": "agent", "type": "model", "agent_id": agentID}, {"id": "approval", "type": "approval_gate"}, {"id": "result", "type": "output", "output_pointer": "/steps/agent"}})
		} else {
			steps, _ = json.Marshal([]map[string]any{{"id": "agent", "type": "model", "agent_id": agentID}, {"id": "result", "type": "output", "output_pointer": "/steps/agent"}})
		}
		var workflowID int64
		var currentVersion int
		var currentSteps []byte
		err = tx.QueryRowContext(ctx, `SELECT w.id, w.current_version, v.steps
			FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
			WHERE w.template_key=$1 AND w.deleted_at IS NULL FOR UPDATE`, key).Scan(&workflowID, &currentVersion, &currentSteps)
		if errors.Is(err, sql.ErrNoRows) {
			meta, ok := starterWorkflowMeta[key]
			if !ok {
				return 0, fmt.Errorf("starter workflow %q definition is missing", key)
			}
			err = tx.QueryRowContext(ctx, `SELECT id, current_version FROM ai_workflows WHERE template_key=$1 FOR UPDATE`, key).Scan(&workflowID, &currentVersion)
			if errors.Is(err, sql.ErrNoRows) {
				currentVersion = 1
				err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
					(name, description, enabled, template_key, cron_expression, timezone, current_version, creation_origin)
					VALUES ($1, $2, FALSE, $3, $4, 'Asia/Shanghai', $5, $6)
					RETURNING id`, meta.name, meta.description, key, meta.cronExpression, currentVersion, "system").Scan(&workflowID)
				if err != nil {
					return 0, fmt.Errorf("create starter workflow %q: %w", key, err)
				}
				if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
					(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
					json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
					return 0, fmt.Errorf("create starter workflow %q version: %w", key, err)
				}
				continue
			} else if err != nil {
				return 0, err
			}
			if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET deleted_at=NULL, enabled=FALSE, next_run_at=NULL,
				current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
				return 0, err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
				(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
				json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
				return 0, err
			}
			continue
		} else if err != nil {
			return 0, fmt.Errorf("starter workflow %q is unavailable: %w", key, err)
		}
		if sameJSON(currentSteps, steps) {
			continue
		}
		if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET enabled=FALSE, next_run_at=NULL,
			current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
			return 0, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
			(workflow_id,version,input_schema,steps,creation_origin) VALUES ($1,$2,$3,$4,$5)`, workflowID, currentVersion,
			json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
			return 0, err
		}
	}
	additionalCreated, err := reconcileProviderDependentStarters(ctx, tx, systemAgents)
	if err != nil {
		return 0, err
	}
	created += additionalCreated
	if _, err = tx.ExecContext(ctx, `UPDATE ai_workspace_bootstrap SET version=$1, provider_profile_id=$2, completed_at=NOW() WHERE singleton=TRUE`, starterPackVersion, providerID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return created, nil
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

func (r *AgentRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
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

func (r *AgentRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
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

func (r *AgentRepository) UpdateSkill(ctx context.Context, skill *domain.AgentSkill) error {
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

func (r *AgentRepository) insertSkillVersion(ctx context.Context, tx *sql.Tx, skill *domain.AgentSkill, capabilities, triggers []byte) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_skill_versions
		(skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, content_publish_mode, created_by_principal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		skill.ID, skill.Version, skill.SystemPrompt, capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps,
		skill.MaxInputTokens, skill.MaxOutputTokens, skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget,
		skill.InputSchema, triggers, skill.ContentPublishMode, skill.CreatedByPrincipalID).Scan(&skill.VersionID)
}

func (r *AgentRepository) ListSkillVersions(ctx context.Context, skillID int64) ([]*domain.AgentSkill, error) {
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

func (r *AgentRepository) GetSkillVersion(ctx context.Context, versionID int64) (*domain.AgentSkill, error) {
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT sv.skill_id, s.system_key, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.tool_bindings, sv.execution_mode, sv.content_publish_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.default_daily_run_limit, sv.default_monthly_token_budget, sv.version, sv.id, sv.input_schema,
		sv.allowed_triggers, sv.created_by_principal_id, sv.creation_origin, s.created_at, sv.created_at
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
