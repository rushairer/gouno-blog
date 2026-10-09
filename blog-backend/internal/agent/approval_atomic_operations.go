package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	opsdomain "github.com/rushairer/blog-backend/internal/operations/domain"
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

type distributionDraftApprovalPayload struct {
	PostID int64  `json:"post_id"`
	Format string `json:"format"`
	Body   string `json:"body"`
}

func decodeDistributionDraftApproval(approval *domain.AgentApproval) (distributionDraftApprovalPayload, error) {
	var payload distributionDraftApprovalPayload
	if approval == nil {
		return payload, errors.New("approval is required")
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return payload, err
	}
	if payload.PostID <= 0 || strings.TrimSpace(payload.Body) == "" {
		return payload, errors.New("invalid distribution draft")
	}
	switch payload.Format {
	case "social", "newsletter", "faq", "image_brief":
		return payload, nil
	default:
		return payload, errors.New("invalid distribution draft format")
	}
}

func isAtomicApprovalAction(actionType string) bool {
	switch actionType {
	case "create_editorial_task", "reply_comment", "create_content_candidates",
		"create_media_candidate", "create_distribution_draft", "create_operational_suggestion":
		return true
	default:
		return false
	}
}

// commitApprovalEffect runs business persistence and the Agent approval state
// update under a single PostgreSQL commit, preserving their owning modules.
func (s *ApprovalService) commitApprovalEffect(ctx context.Context, approvalID int64, persist func(*sql.Tx) error) error {
	return s.transactor.Run(ctx, func(tx *sql.Tx) error {
		if err := persist(tx); err != nil {
			return err
		}
		return s.approvals.CompleteApprovalTx(ctx, tx, approvalID, domain.ApprovalExecuted, "")
	})
}

// executeAtomicApproval is only called after durable reviewer claim. A
// post-COMMIT acknowledgement error still propagates as an uncertain result;
// replay of the claimed approval is forbidden by its persistent status.
func (s *ApprovalService) executeAtomicApproval(ctx context.Context, approval *domain.AgentApproval) error {
	if s.transactor == nil {
		return errors.New("approval transaction runner is unavailable")
	}
	if approval == nil {
		return errors.New("approval is required")
	}

	switch approval.ActionType {
	case "create_editorial_task":
		writer, ok := s.effects.(ApprovalEffectTransactionWriter)
		if !ok {
			return errors.New("approval transactional effect writer is unavailable")
		}
		payload, err := decodeEditorialTaskApproval(approval)
		if err != nil {
			return err
		}
		return s.commitApprovalEffect(ctx, approval.ID, func(tx *sql.Tx) error {
			return writer.CreateEditorialTaskTx(ctx, tx, approval.ID, payload.Title, payload.Description, payload.Priority)
		})
	case "reply_comment":
		writer, ok := s.effects.(ApprovalEffectTransactionWriter)
		if !ok {
			return errors.New("approval transactional effect writer is unavailable")
		}
		payload, err := decodeReplyDraftApproval(approval)
		if err != nil {
			return err
		}
		return s.commitApprovalEffect(ctx, approval.ID, func(tx *sql.Tx) error {
			return writer.CreateReplyDraftTx(ctx, tx, approval.ID, payload.CommentID, payload.Content)
		})
	case "create_content_candidates":
		writer, ok := s.effects.(ApprovalEffectTransactionWriter)
		if !ok {
			return errors.New("approval transactional effect writer is unavailable")
		}
		return s.commitApprovalEffect(ctx, approval.ID, func(tx *sql.Tx) error {
			if err := writer.CreateContentCandidateSetTx(ctx, tx, approval); err != nil {
				return fmt.Errorf("%w: %v", ErrInvalid, err)
			}
			return nil
		})
	case "create_operational_suggestion":
		writer, ok := s.effects.(ApprovalSuggestionTransactionWriter)
		if !ok {
			return errors.New("approval transactional effect writer is unavailable")
		}
		var payload opsdomain.OperationalSuggestion
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		// SourceRunID must come from the approved Agent Run, not from caller-
		// supplied JSON; retain the original trusted provenance invariant.
		payload.SourceRunID = &approval.RunID
		return s.commitApprovalEffect(ctx, approval.ID, func(tx *sql.Tx) error {
			return writer.CreateOperationalSuggestionTx(ctx, tx, &payload)
		})
	case "create_media_candidate":
		return s.commitApprovalMediaCandidate(ctx, approval)
	case "create_distribution_draft":
		payload, err := decodeDistributionDraftApproval(approval)
		if err != nil {
			return err
		}
		if payload.Format == "image_brief" {
			return s.commitApprovalMediaCandidate(ctx, approval)
		}
		// Social/newsletter/FAQ proposals have no immediate database effect.
		// Complete the approved decision without creating media content.
		return s.commitApprovalEffect(ctx, approval.ID, func(*sql.Tx) error { return nil })
	default:
		return errors.New("unsupported atomic approval action")
	}
}

func (s *ApprovalService) commitApprovalMediaCandidate(ctx context.Context, approval *domain.AgentApproval) error {
	writer, ok := s.mediaCandidates.(ApprovalMediaCandidateTransactionWriter)
	if !ok {
		return errors.New("approval transactional media candidate writer is unavailable")
	}
	return s.commitApprovalEffect(ctx, approval.ID, func(tx *sql.Tx) error {
		if err := writer.CreateMediaCandidateTx(ctx, tx, approval); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		return nil
	})
}
