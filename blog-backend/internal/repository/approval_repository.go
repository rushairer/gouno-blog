package repository

import (
	"context"
	"database/sql"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

// Approval persistence now belongs to the Agent capability. Keep this facade
// while the Agent services still depend on the transitional AgentRepository.
// ReconcileApprovalRun remains here until Agent Run persistence moves into the
// same canonical capability repository, because it spans both aggregates.
func (r *AgentRepository) approvals() *agentrepository.ApprovalRepository {
	return agentrepository.NewApprovalRepository(r.db)
}

func (r *AgentRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
	return r.approvals().CreateApproval(ctx, approval)
}

func (r *AgentRepository) CreateApprovalTx(ctx context.Context, tx *sql.Tx, approval *domain.AgentApproval) error {
	return r.approvals().CreateApprovalTx(ctx, tx, approval)
}

func (r *AgentRepository) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error {
	return r.approvals().CreateContentCandidateSet(ctx, approval)
}

func (r *AgentRepository) GetApproval(ctx context.Context, id int64) (*domain.AgentApproval, error) {
	return r.approvals().GetApproval(ctx, id)
}

func (r *AgentRepository) ListApprovals(ctx context.Context, status string, limit, offset int) ([]*domain.AgentApproval, int, error) {
	return r.approvals().ListApprovals(ctx, status, limit, offset)
}

func (r *AgentRepository) ClaimApproval(ctx context.Context, id int64, reviewerPrincipalID int64, note string) error {
	return r.approvals().ClaimApproval(ctx, id, reviewerPrincipalID, note)
}

func (r *AgentRepository) CompleteApproval(ctx context.Context, id int64, status domain.ApprovalStatus, note string) error {
	return r.approvals().CompleteApproval(ctx, id, status, note)
}

func (r *AgentRepository) SetApprovalTarget(ctx context.Context, id, targetID int64) error {
	return r.approvals().SetApprovalTarget(ctx, id, targetID)
}

func (r *AgentRepository) RejectApproval(ctx context.Context, id int64, reviewerPrincipalID int64, note string) error {
	return r.approvals().RejectApproval(ctx, id, reviewerPrincipalID, note)
}

func (r *AgentRepository) ReconcileApprovalRun(ctx context.Context, approvalID int64) (*domain.AgentRun, error) {
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
	if pending == 0 {
		status := domain.AgentRunSucceeded
		if unsuccessful > 0 {
			status = domain.AgentRunCancelled
		}
		if _, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET status=$2,finished_at=NOW()
			WHERE id=$1 AND status='awaiting_approval'`, runID, status); err != nil {
			return nil, err
		}
	} else if unsuccessful > 0 {
		if _, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET status='rejected',review_note='cancelled because another proposal in this run was rejected',reviewed_at=NOW()
			WHERE run_id=$1 AND status IN ('pending','approved')`, runID); err != nil {
			return nil, err
		}
		if _, err := r.db.ExecContext(ctx, `UPDATE ai_agent_runs SET status='cancelled',finished_at=NOW()
			WHERE id=$1 AND status='awaiting_approval'`, runID); err != nil {
			return nil, err
		}
	}
	return r.GetRun(ctx, runID)
}

func (r *AgentRepository) CreateEditorialTask(ctx context.Context, approvalID int64, title, description, priority string) error {
	return r.approvals().CreateEditorialTask(ctx, approvalID, title, description, priority)
}

func (r *AgentRepository) CreateReplyDraft(ctx context.Context, approvalID, commentID int64, content string) error {
	return r.approvals().CreateReplyDraft(ctx, approvalID, commentID, content)
}

func (r *AgentRepository) CreateOperationalSuggestion(ctx context.Context, value *domain.OperationalSuggestion) error {
	return r.approvals().CreateOperationalSuggestion(ctx, value)
}
