package repository

import (
	"context"
	"database/sql"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

// Approval persistence belongs to the Agent capability. Keep this facade while
// Agent services still depend on the transitional AgentRepository.
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
	return r.approvals().ReconcileApprovalRun(ctx, approvalID)
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
