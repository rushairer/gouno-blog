package repository

import (
	"context"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

// Approval creation remains as a transitional Runner facade. ApprovalService
// consumes the canonical Agent ApprovalRepository directly.
func (r *AgentRepository) approvals() *agentrepository.ApprovalRepository {
	return agentrepository.NewApprovalRepository(r.db)
}

func (r *AgentRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
	return r.approvals().CreateApproval(ctx, approval)
}
