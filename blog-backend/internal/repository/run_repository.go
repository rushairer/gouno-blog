package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

// Agent Run persistence now belongs to the Agent capability. Keep these
// methods as a compatibility facade while Runner/Operations still depend on
// the transitional AgentRepository.
func (r *AgentRepository) runs() *agentrepository.RunRepository {
	return agentrepository.NewRunRepository(r.db)
}

func (r *AgentRepository) CreateRun(ctx context.Context, run *domain.AgentRun) error {
	return r.runs().CreateRun(ctx, run)
}

func (r *AgentRepository) StartRun(ctx context.Context, id int64) error {
	return r.runs().StartRun(ctx, id)
}

func (r *AgentRepository) FinishRun(ctx context.Context, id int64, status domain.AgentRunStatus, summary string, inputTokens, outputTokens int64, errorCode, errorMessage *string) error {
	if err := r.runs().FinishRun(ctx, id, status, summary, inputTokens, outputTokens, errorCode, errorMessage); err != nil {
		return err
	}
	return r.mediaCandidates().SyncRunTokenUsage(ctx, id, inputTokens, outputTokens)
}

func (r *AgentRepository) SaveRunCitations(ctx context.Context, id int64, citations []domain.AgentCitation) error {
	return r.runs().SaveRunCitations(ctx, id, citations)
}

func (r *AgentRepository) GetRun(ctx context.Context, id int64) (*domain.AgentRun, error) {
	return r.runs().GetRun(ctx, id)
}

func (r *AgentRepository) ListRuns(ctx context.Context, agentID int64, limit, offset int) ([]*domain.AgentRun, int, error) {
	return r.runs().ListRuns(ctx, agentID, limit, offset)
}

func (r *AgentRepository) DailyRunCount(ctx context.Context, agentID int64) (int, error) {
	return r.runs().DailyRunCount(ctx, agentID)
}

func (r *AgentRepository) MonthlyTokenUsage(ctx context.Context, agentID int64) (int64, error) {
	return r.runs().MonthlyTokenUsage(ctx, agentID)
}

func (r *AgentRepository) CreateToolCall(ctx context.Context, call *domain.AgentToolCall) error {
	return r.runs().CreateToolCall(ctx, call)
}

func (r *AgentRepository) CreateToolCallTx(ctx context.Context, tx *sql.Tx, call *domain.AgentToolCall) error {
	return r.runs().CreateToolCallTx(ctx, tx, call)
}

func (r *AgentRepository) FinishToolCall(ctx context.Context, id int64, status domain.ToolCallStatus, result json.RawMessage, errorMessage *string) error {
	return r.runs().FinishToolCall(ctx, id, status, result, errorMessage)
}

func (r *AgentRepository) ListToolCalls(ctx context.Context, runID int64) ([]*domain.AgentToolCall, error) {
	return r.runs().ListToolCalls(ctx, runID)
}

// DeleteRun permanently removes a terminal run and its dependent audit rows.
// It deliberately refuses active work and leaves any resulting post/media
// assets intact; only the generated candidate records are removed. The
// cross-repository cleanup remains one database transaction.
func (r *AgentRepository) DeleteRun(ctx context.Context, runID int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	status, err := r.runs().LockRunStatus(ctx, tx, runID)
	if err != nil {
		return err
	}
	if status != domain.AgentRunSucceeded && status != domain.AgentRunFailed && status != domain.AgentRunCancelled {
		return errors.New("only completed Agent runs can be deleted")
	}
	if err := r.mediaCandidates().DeleteBySourceRunTx(ctx, tx, runID); err != nil {
		return err
	}
	if err := r.runs().DeleteRunTx(ctx, tx, runID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *AgentRepository) RecordUsage(ctx context.Context, event *domain.UsageEvent) error {
	return r.runs().RecordUsage(ctx, event)
}
