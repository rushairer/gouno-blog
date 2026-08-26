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
			(system_key,name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget)
			VALUES ($1,$2,$3,NULL,$4,FALSE,'manual','Asia/Shanghai',$5,$6)
			ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING
			RETURNING id`, item.systemKey, item.name, item.description, item.skillVersionID, item.dailyLimit, item.monthlyBudget).Scan(&agentID)
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
					(name, description, enabled, template_key, cron_expression, timezone, current_version)
					VALUES ($1, $2, FALSE, $3, $4, 'Asia/Shanghai', $5)
					RETURNING id`, meta.name, meta.description, key, meta.cronExpression, currentVersion).Scan(&workflowID)
				if err != nil {
					return 0, fmt.Errorf("create starter workflow %q: %w", key, err)
				}
				if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
					(workflow_id, version, input_schema, steps) VALUES ($1, $2, $3, $4)`, workflowID, currentVersion,
					json.RawMessage(`{"type":"object","additionalProperties":false}`), steps); err != nil {
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
				(workflow_id, version, input_schema, steps) VALUES ($1, $2, $3, $4)`, workflowID, currentVersion,
				json.RawMessage(`{"type":"object","additionalProperties":false}`), steps); err != nil {
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
			(workflow_id,version,input_schema,steps) VALUES ($1,$2,$3,$4)`, workflowID, currentVersion,
			json.RawMessage(`{"type":"object","additionalProperties":false}`), steps); err != nil {
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
	a.monthly_token_budget, a.last_run_at, a.next_run_at, a.created_by, a.created_at, a.updated_at`

func scanAgent(scanner interface{ Scan(...any) error }) (*domain.Agent, error) {
	var agent domain.Agent
	err := scanner.Scan(
		&agent.ID, &agent.SystemKey, &agent.Name, &agent.Description, &agent.ProviderProfileID,
		&agent.SkillVersionID, &agent.Enabled, &agent.TriggerType, &agent.CronExpression, &agent.Timezone,
		&agent.MaxStepsOverride, &agent.MaxInputTokensOverride, &agent.MaxOutputTokensOverride,
		&agent.DailyRunLimit, &agent.MonthlyTokenBudget, &agent.LastRunAt, &agent.NextRunAt,
		&agent.CreatedBy, &agent.CreatedAt, &agent.UpdatedAt,
	)
	return &agent, err
}

func (r *AgentRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_agents
		(system_key, name, description, provider_profile_id, skill_version_id, enabled, trigger_type,
		 cron_expression, timezone, max_steps_override, max_input_tokens_override, max_output_tokens_override,
		 daily_run_limit, monthly_token_budget, next_run_at, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING id, created_at, updated_at`,
		agent.SystemKey, agent.Name, agent.Description, agent.ProviderProfileID, agent.SkillVersionID, agent.Enabled,
		agent.TriggerType, agent.CronExpression, agent.Timezone, agent.MaxStepsOverride, agent.MaxInputTokensOverride,
		agent.MaxOutputTokensOverride, agent.DailyRunLimit,
		agent.MonthlyTokenBudget, agent.NextRunAt, agent.CreatedBy,
	).Scan(&agent.ID, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *AgentRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.db.QueryRowContext(ctx, `UPDATE ai_agents SET
		system_key=$2, name=$3, description=$4, provider_profile_id=$5,
		skill_version_id=$6, enabled=$7, trigger_type=$8, cron_expression=$9, timezone=$10,
		max_steps_override=$11, max_input_tokens_override=$12, max_output_tokens_override=$13,
		daily_run_limit=$14, monthly_token_budget=$15, next_run_at=$16, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING last_run_at, created_by, created_at, updated_at`,
		agent.ID, agent.SystemKey, agent.Name, agent.Description, agent.ProviderProfileID,
		agent.SkillVersionID, agent.Enabled, agent.TriggerType, agent.CronExpression, agent.Timezone,
		agent.MaxStepsOverride, agent.MaxInputTokensOverride, agent.MaxOutputTokensOverride,
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

const skillColumns = `s.id, s.system_key, s.name, s.description, s.system_prompt, s.capabilities, s.tool_bindings, s.execution_mode,
	s.content_publish_mode, s.max_steps, s.max_input_tokens, s.max_output_tokens, s.default_daily_run_limit, s.default_monthly_token_budget,
	s.version, COALESCE((SELECT sv.id FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version),0),
	s.input_schema, s.allowed_triggers, s.created_by, s.created_at, s.updated_at`

func scanSkill(scanner interface{ Scan(...any) error }) (*domain.AgentSkill, error) {
	var skill domain.AgentSkill
	var capabilities, toolBindings, inputSchema, triggers []byte
	err := scanner.Scan(&skill.ID, &skill.SystemKey, &skill.Name, &skill.Description, &skill.SystemPrompt, &capabilities,
		&toolBindings, &skill.ExecutionMode, &skill.ContentPublishMode, &skill.MaxSteps, &skill.MaxInputTokens, &skill.MaxOutputTokens,
		&skill.DefaultDailyRunLimit, &skill.DefaultMonthlyTokenBudget, &skill.Version, &skill.VersionID,
		&inputSchema, &triggers, &skill.CreatedBy,
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
		 max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, content_publish_mode, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id, version, created_at, updated_at`, skill.Name, skill.Description, skill.SystemPrompt,
		capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens, skill.MaxOutputTokens,
		skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, skill.InputSchema, triggers, skill.ContentPublishMode, skill.CreatedBy,
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
		RETURNING version, created_by, created_at, updated_at`, skill.ID, skill.Name, skill.Description,
		skill.SystemPrompt, capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps, skill.MaxInputTokens,
		skill.MaxOutputTokens, skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, skill.InputSchema, triggers, skill.ContentPublishMode,
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
		(skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, max_steps, max_input_tokens,
		 max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, content_publish_mode, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		skill.ID, skill.Version, skill.SystemPrompt, capabilities, skill.ToolBindings, skill.ExecutionMode, skill.MaxSteps,
		skill.MaxInputTokens, skill.MaxOutputTokens, skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget,
		skill.InputSchema, triggers, skill.ContentPublishMode, skill.CreatedBy).Scan(&skill.VersionID)
}

func (r *AgentRepository) ListSkillVersions(ctx context.Context, skillID int64) ([]*domain.AgentSkill, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT sv.skill_id, s.system_key, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.tool_bindings, sv.execution_mode, sv.content_publish_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.default_daily_run_limit, sv.default_monthly_token_budget, sv.version, sv.id, sv.input_schema,
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
	return scanSkill(r.db.QueryRowContext(ctx, `SELECT sv.skill_id, s.system_key, s.name, s.description, sv.system_prompt,
		sv.capabilities, sv.tool_bindings, sv.execution_mode, sv.content_publish_mode, sv.max_steps, sv.max_input_tokens, sv.max_output_tokens,
		sv.default_daily_run_limit, sv.default_monthly_token_budget, sv.version, sv.id, sv.input_schema,
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
		r.skill_version_id, r.workflow_version_id, r.workflow_run_id`

func scanRun(scanner interface{ Scan(...any) error }) (*domain.AgentRun, error) {
	var run domain.AgentRun
	var citations []byte
	err := scanner.Scan(
		&run.ID, &run.AgentID, &run.TriggerType, &run.TriggeredBy, &run.ScheduleKey, &run.Status,
		&run.Input, &run.OutputSummary, &run.Provider, &run.Model, &run.InputTokens,
		&run.OutputTokens, &run.ErrorCode, &run.ErrorMessage, &run.StartedAt, &run.FinishedAt,
		&run.CreatedAt, &citations, &run.SkillVersionID, &run.WorkflowVersionID, &run.WorkflowRunID,
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
		(agent_id, trigger_type, triggered_by, schedule_key, status, input, provider, model, skill_version_id, workflow_version_id, workflow_run_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, created_at`,
		run.AgentID, run.TriggerType, run.TriggeredBy, run.ScheduleKey, run.Status, run.Input,
		run.Provider, run.Model, run.SkillVersionID, run.WorkflowVersionID, run.WorkflowRunID,
	).Scan(&run.ID, &run.CreatedAt)
}

func (r *AgentRepository) WorkflowScopePolicy(ctx context.Context, workflowVersionID int64) (domain.WorkflowScopePolicy, error) {
	var raw []byte
	if err := r.db.QueryRowContext(ctx, `SELECT scope_policy FROM ai_workflow_versions WHERE id=$1`, workflowVersionID).Scan(&raw); err != nil {
		return domain.WorkflowScopePolicy{}, err
	}
	var policy domain.WorkflowScopePolicy
	err := json.Unmarshal(raw, &policy)
	return policy, err
}

func (r *AgentRepository) WorkflowResourceAccess(ctx context.Context, workflowRunID int64, resourceType, key string) (string, bool, error) {
	var access string
	err := r.db.QueryRowContext(ctx, `SELECT access_level FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND resource_type=$2 AND resource_key=$3`, workflowRunID, resourceType, key).Scan(&access)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return access, err == nil, err
}

func (r *AgentRepository) AddDiscoveredWorkflowResource(ctx context.Context, workflowRunID int64, resourceType, key, label string, snapshot json.RawMessage) error {
	if len(snapshot) == 0 {
		snapshot = json.RawMessage(`{}`)
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources(workflow_run_id,resource_type,resource_key,source,access_level,label,snapshot)
		VALUES($1,$2,$3,'discovery','read',$4,$5) ON CONFLICT(workflow_run_id,resource_type,resource_key) DO NOTHING`, workflowRunID, resourceType, key, label, snapshot)
	return err
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
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET input_tokens=$2,output_tokens=$3 WHERE source_run_id=$1`, id, inputTokens, outputTokens)
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
		FROM ai_tool_calls WHERE run_id=$1 ORDER BY created_at DESC, id DESC`, runID)
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

// DeleteRun permanently removes a terminal run and its dependent audit rows.
// It deliberately refuses active work and leaves any resulting post/media
// assets intact; only the generated candidate records are removed.
func (r *AgentRepository) DeleteRun(ctx context.Context, runID int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var status domain.AgentRunStatus
	if err := tx.QueryRowContext(ctx, `SELECT status FROM ai_agent_runs WHERE id=$1 FOR UPDATE`, runID).Scan(&status); err != nil {
		return err
	}
	if status != domain.AgentRunSucceeded && status != domain.AgentRunFailed && status != domain.AgentRunCancelled {
		return errors.New("only completed Agent runs can be deleted")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ai_media_candidates WHERE source_run_id=$1`, runID); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE id=$1`, runID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return sql.ErrNoRows
	}
	return tx.Commit()
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
