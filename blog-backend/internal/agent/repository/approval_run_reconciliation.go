package repository

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
)

// ReconcileApprovalRun resolves the owning Agent Run after one proposal changes
// state. Approval SQL stays here; Run state changes are delegated to RunRepository.
func (r *ApprovalRepository) ReconcileApprovalRun(ctx context.Context, approvalID int64) (*domain.AgentRun, error) {
	var runID int64
	if err := r.db.QueryRowContext(ctx, `SELECT run_id FROM ai_approvals WHERE id=$1`, approvalID).Scan(&runID); err != nil {
		return nil, err
	}

	var pending, unsuccessful int
	if err := r.db.QueryRowContext(ctx, `SELECT
		COUNT(*) FILTER (WHERE status IN ('pending','approved')),
		COUNT(*) FILTER (WHERE status IN ('rejected','expired','failed'))
		FROM ai_approvals WHERE run_id=$1`, runID).Scan(&pending, &unsuccessful); err != nil {
		return nil, err
	}

	runs := NewRunRepository(r.db)
	if pending == 0 {
		status := domain.AgentRunSucceeded
		if unsuccessful > 0 {
			status = domain.AgentRunCancelled
		}
		if err := runs.CompleteAwaitingApproval(ctx, runID, status); err != nil {
			return nil, err
		}
	} else if unsuccessful > 0 {
		if _, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET status='rejected',review_note='cancelled because another proposal in this run was rejected',reviewed_at=NOW()
			WHERE run_id=$1 AND status IN ('pending','approved')`, runID); err != nil {
			return nil, err
		}
		if err := runs.CompleteAwaitingApproval(ctx, runID, domain.AgentRunCancelled); err != nil {
			return nil, err
		}
	}
	return runs.GetRun(ctx, runID)
}
