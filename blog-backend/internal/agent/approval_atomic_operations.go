package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

type replyDraftApprovalPayload struct {
	CommentID int64  `json:"comment_id"`
	Content   string `json:"content"`
}

func decodeReplyDraftApproval(approval *domain.AgentApproval) (replyDraftApprovalPayload, error) {
	var payload replyDraftApprovalPayload
	if approval == nil {
		return payload, errors.New("approval is required")
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return payload, err
	}
	if payload.CommentID <= 0 || strings.TrimSpace(payload.Content) == "" {
		return payload, errors.New("invalid reply draft")
	}
	return payload, nil
}

type editorialTaskApprovalPayload struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

func decodeEditorialTaskApproval(approval *domain.AgentApproval) (editorialTaskApprovalPayload, error) {
	var payload editorialTaskApprovalPayload
	if approval == nil {
		return payload, errors.New("approval is required")
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return payload, err
	}
	if payload.Priority == "" {
		payload.Priority = "medium"
	}
	return payload, nil
}

func isAtomicOperationsApproval(actionType string) bool {
	switch actionType {
	case "create_editorial_task", "reply_comment":
		return true
	default:
		return false
	}
}

// executeAtomicOperationsApproval commits the business effect and its final
// approval status together. The initial human claim remains a separate,
// already-durable step; ambiguous errors still quarantine that claim.
func (s *ApprovalService) executeAtomicOperationsApproval(ctx context.Context, approval *domain.AgentApproval) error {
	if s.transactor == nil {
		return errors.New("approval transaction runner is unavailable")
	}
	writer, ok := s.effects.(ApprovalEffectTransactionWriter)
	if !ok {
		return errors.New("approval transactional effect writer is unavailable")
	}
	if approval == nil {
		return errors.New("approval is required")
	}

	switch approval.ActionType {
	case "create_editorial_task":
		payload, err := decodeEditorialTaskApproval(approval)
		if err != nil {
			return err
		}
		return s.transactor.Run(ctx, func(tx *sql.Tx) error {
			if err := writer.CreateEditorialTaskTx(ctx, tx, approval.ID, payload.Title, payload.Description, payload.Priority); err != nil {
				return err
			}
			return s.approvals.CompleteApprovalTx(ctx, tx, approval.ID, domain.ApprovalExecuted, "")
		})
	case "reply_comment":
		payload, err := decodeReplyDraftApproval(approval)
		if err != nil {
			return err
		}
		return s.transactor.Run(ctx, func(tx *sql.Tx) error {
			if err := writer.CreateReplyDraftTx(ctx, tx, approval.ID, payload.CommentID, payload.Content); err != nil {
				return err
			}
			return s.approvals.CompleteApprovalTx(ctx, tx, approval.ID, domain.ApprovalExecuted, "")
		})
	default:
		return errors.New("unsupported atomic approval action")
	}
}
