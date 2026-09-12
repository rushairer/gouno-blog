package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
)

type StarterRepository struct{}

func NewStarterRepository() *StarterRepository {
	return &StarterRepository{}
}

type coreStarterWorkflow struct {
	key, name, description, cron string
	approval                     bool
}

func coreStarterWorkflows() []coreStarterWorkflow {
	return []coreStarterWorkflow{
		{key: "daily_news", name: "AI 每日资讯", description: "每天 09:00 调度 AI 每日资讯 Agent。", cron: "0 9 * * *"},
		{key: "weekly_operations", name: "周度运营复盘", description: "每周调度周度运营复盘 Agent。", cron: "0 9 * * 1"},
		{key: "stale_content_refresh", name: "陈旧内容更新", description: "定期调度陈旧内容更新 Agent。", cron: "0 9 * * 2", approval: true},
		{key: "low_engagement", name: "低互动文章分析", description: "定期调度低互动文章分析 Agent。", cron: "0 9 * * 3"},
	}
}

func starterJSONEqual(left, right []byte) bool {
	var leftValue, rightValue any
	return json.Unmarshal(left, &leftValue) == nil && json.Unmarshal(right, &rightValue) == nil && reflect.DeepEqual(leftValue, rightValue)
}

func coreStarterSteps(agentID int64, approval bool) []byte {
	steps := []map[string]any{{"id": "agent", "type": "model", "agent_id": agentID}}
	if approval {
		steps = append(steps, map[string]any{"id": "approval", "type": "approval_gate"})
	}
	steps = append(steps, map[string]any{"id": "result", "type": "output", "output_pointer": "/steps/agent"})
	encoded, _ := json.Marshal(steps)
	return encoded
}

func (r *StarterRepository) ReconcileCoreStarterWorkflows(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) error {
	definitions := coreStarterWorkflows()
	for _, definition := range definitions {
		if systemAgents[definition.key] <= 0 {
			return fmt.Errorf("starter workflow Agent bindings are incomplete")
		}
	}

	for _, definition := range definitions {
		agentID := systemAgents[definition.key]
		steps := coreStarterSteps(agentID, definition.approval)
		var workflowID int64
		var currentVersion int
		var currentSteps []byte
		err := tx.QueryRowContext(ctx, `SELECT w.id, w.current_version, v.steps
			FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
			WHERE w.template_key=$1 AND w.deleted_at IS NULL FOR UPDATE`, definition.key).
			Scan(&workflowID, &currentVersion, &currentSteps)
		if errors.Is(err, sql.ErrNoRows) {
			err = tx.QueryRowContext(ctx, `SELECT id, current_version FROM ai_workflows WHERE template_key=$1 FOR UPDATE`, definition.key).
				Scan(&workflowID, &currentVersion)
			if errors.Is(err, sql.ErrNoRows) {
				currentVersion = 1
				if err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
					(name, description, enabled, template_key, cron_expression, timezone, current_version, creation_origin)
					VALUES ($1, $2, FALSE, $3, $4, 'Asia/Shanghai', $5, $6)
					RETURNING id`, definition.name, definition.description, definition.key, definition.cron, currentVersion, "system").Scan(&workflowID); err != nil {
					return fmt.Errorf("create starter workflow %q: %w", definition.key, err)
				}
				if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
					(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
					json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
					return fmt.Errorf("create starter workflow %q version: %w", definition.key, err)
				}
				continue
			}
			if err != nil {
				return err
			}
			if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET deleted_at=NULL, enabled=FALSE, next_run_at=NULL,
				current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
				(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
				json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return fmt.Errorf("starter workflow %q is unavailable: %w", definition.key, err)
		}
		if starterJSONEqual(currentSteps, steps) {
			continue
		}
		if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET enabled=FALSE, next_run_at=NULL,
			current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
			(workflow_id,version,input_schema,steps,creation_origin) VALUES ($1,$2,$3,$4,$5)`, workflowID, currentVersion,
			json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
			return err
		}
	}
	return nil
}

func (r *StarterRepository) ReconcileProviderDependentStarters(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) (int, error) {
	return ReconcileProviderDependentStarters(ctx, tx, systemAgents)
}
