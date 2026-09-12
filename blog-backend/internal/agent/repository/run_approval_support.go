package repository

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
)

// CompleteAwaitingApproval transitions only a Run that is waiting for approval.
// Approval reconciliation calls this method so ai_agent_runs writes remain
// owned by RunRepository.
func (r *RunRepository) CompleteAwaitingApproval(ctx context.Context, runID int64, status domain.AgentRunStatus) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET status=$2,finished_at=NOW()
		WHERE id=$1 AND status='awaiting_approval'`, runID, status)
	return err
}
