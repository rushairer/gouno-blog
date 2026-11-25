package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

type RunRepository struct {
	db *sql.DB
}

func NewRunRepository(db *sql.DB) *RunRepository {
	return &RunRepository{db: db}
}

const runColumns = `r.id, r.agent_id, r.trigger_type, r.triggered_by_principal_id, r.schedule_key, r.status,
	r.input, r.output_summary, r.provider, r.model, r.input_tokens, r.output_tokens,
	r.error_code, r.error_message, r.started_at, r.finished_at, r.created_at, r.citations,
		r.skill_version_id, r.workflow_version_id, r.workflow_run_id`

func scanRun(scanner interface{ Scan(...any) error }) (*domain.AgentRun, error) {
	var run domain.AgentRun
	var citations []byte
	err := scanner.Scan(
		&run.ID, &run.AgentID, &run.TriggerType, &run.TriggeredByPrincipalID, &run.ScheduleKey, &run.Status,
		&run.Input, &run.OutputSummary, &run.Provider, &run.Model, &run.InputTokens,
		&run.OutputTokens, &run.ErrorCode, &run.ErrorMessage, &run.StartedAt, &run.FinishedAt,
		&run.CreatedAt, &citations, &run.SkillVersionID, &run.WorkflowVersionID, &run.WorkflowRunID,
	)
	if err == nil {
		err = json.Unmarshal(citations, &run.Citations)
	}
	return &run, err
}

func (r *RunRepository) CreateRun(ctx context.Context, run *domain.AgentRun) error {
	if len(run.Input) == 0 {
		run.Input = json.RawMessage(`{}`)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id, trigger_type, triggered_by_principal_id, schedule_key, status, input, provider, model, skill_version_id, workflow_version_id, workflow_run_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, created_at`,
		run.AgentID, run.TriggerType, run.TriggeredByPrincipalID, run.ScheduleKey, run.Status, run.Input,
		run.Provider, run.Model, run.SkillVersionID, run.WorkflowVersionID, run.WorkflowRunID,
	).Scan(&run.ID, &run.CreatedAt)
}

func (r *RunRepository) StartRun(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs
		SET status='running', started_at=NOW()
		WHERE id=$1 AND status='queued'`, id)
	if err != nil {
		return err
	}
	return requireRunTransition(result)
}

// FinishRunTx closes only a running execution. Approval reconciliation owns
// its separate awaiting_approval transition. The caller coordinates media
// usage in the same transaction; a failure cannot partially finish the run.
func (r *RunRepository) FinishRunTx(ctx context.Context, tx *sql.Tx, id int64, status domain.AgentRunStatus, summary string, inputTokens, outputTokens int64, errorCode, errorMessage *string) error {
	switch status {
	case domain.AgentRunSucceeded, domain.AgentRunFailed, domain.AgentRunAwaitingApproval, domain.AgentRunCancelled:
	default:
		return errors.New("invalid Agent execution terminal status")
	}
	result, err := tx.ExecContext(ctx, `UPDATE ai_agent_runs SET
		status=$2, output_summary=$3, input_tokens=$4, output_tokens=$5,
		error_code=$6, error_message=$7, finished_at=NOW()
		WHERE id=$1 AND status='running'`, id, status, summary, inputTokens, outputTokens, errorCode, errorMessage)
	if err != nil {
		return err
	}
	return requireRunTransition(result)
}

func requireRunTransition(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *RunRepository) SaveRunCitations(ctx context.Context, id int64, citations []domain.AgentCitation) error {
	raw, err := json.Marshal(citations)
	if err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET citations=$2 WHERE id=$1 AND status='running'`, id, raw)
	if err != nil {
		return err
	}
	return requireRunTransition(result)
}

func (r *RunRepository) GetRun(ctx context.Context, id int64) (*domain.AgentRun, error) {
	return scanRun(r.db.QueryRowContext(ctx, `SELECT `+runColumns+` FROM ai_agent_runs r WHERE r.id=$1`, id))
}

func (r *RunRepository) ListRuns(ctx context.Context, agentID int64, limit, offset int) ([]*domain.AgentRun, int, error) {
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

func (r *RunRepository) DailyRunCount(ctx context.Context, agentID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agent_runs
		WHERE agent_id=$1 AND created_at >= date_trunc('day', NOW())`, agentID).Scan(&count)
	return count, err
}

func (r *RunRepository) MonthlyTokenUsage(ctx context.Context, agentID int64) (int64, error) {
	var total int64
	// Count all current-month runs, including active and failed executions.
	// The per-run maximum reconciles durable usage rows with legacy or
	// terminal aggregate counters without counting the same model turn twice.
	err := r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(
		GREATEST(r.input_tokens, COALESCE(u.input_tokens, 0), 0) +
		GREATEST(r.output_tokens, COALESCE(u.output_tokens, 0), 0)), 0)
		FROM ai_agent_runs r
		LEFT JOIN LATERAL (
			SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
			FROM ai_usage_events WHERE run_id=r.id
		) u ON TRUE
		WHERE r.agent_id=$1 AND r.created_at >= date_trunc('month', NOW())`, agentID).Scan(&total)
	return total, err
}

func (r *RunRepository) CreateToolCall(ctx context.Context, call *domain.AgentToolCall) error {
	if len(call.Arguments) == 0 {
		call.Arguments = json.RawMessage(`{}`)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id, provider_call_id, tool_name, risk_level, arguments, status, started_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, created_at`,
		call.RunID, call.ProviderCallID, call.ToolName, call.RiskLevel, call.Arguments, call.Status,
	).Scan(&call.ID, &call.CreatedAt)
}

func (r *RunRepository) CreateToolCallTx(ctx context.Context, tx *sql.Tx, call *domain.AgentToolCall) error {
	if len(call.Arguments) == 0 {
		call.Arguments = json.RawMessage(`{}`)
	}
	return tx.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,provider_call_id,tool_name,risk_level,arguments,status,started_at,finished_at)
		VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id,created_at`,
		call.RunID, call.ProviderCallID, call.ToolName, call.RiskLevel, call.Arguments, call.Status).Scan(&call.ID, &call.CreatedAt)
}

func (r *RunRepository) FinishToolCall(ctx context.Context, id int64, status domain.ToolCallStatus, result json.RawMessage, errorMessage *string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_tool_calls SET
		status=$2, result=$3, error_message=$4, finished_at=NOW() WHERE id=$1`,
		id, status, nullableRunJSON(result), errorMessage)
	return err
}

func nullableRunJSON(value json.RawMessage) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func (r *RunRepository) ListToolCalls(ctx context.Context, runID int64) ([]*domain.AgentToolCall, error) {
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

func (r *RunRepository) LockRunStatus(ctx context.Context, tx *sql.Tx, runID int64) (domain.AgentRunStatus, error) {
	var status domain.AgentRunStatus
	err := tx.QueryRowContext(ctx, `SELECT status FROM ai_agent_runs WHERE id=$1 FOR UPDATE`, runID).Scan(&status)
	return status, err
}

func (r *RunRepository) DeleteRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE id=$1`, runID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *RunRepository) RecordUsage(ctx context.Context, event *domain.UsageEvent) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_usage_events
		(run_id, request_id, provider, model, input_tokens, output_tokens, completed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		event.RunID, event.RequestID, event.Provider, event.Model, event.InputTokens,
		event.OutputTokens, event.CompletedAt,
	).Scan(&event.ID)
}

func (r *RunRepository) DeleteByWorkflowRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE workflow_run_id=$1`, runID)
	return err
}
