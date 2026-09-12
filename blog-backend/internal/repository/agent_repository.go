package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"

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
