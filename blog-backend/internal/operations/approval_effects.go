package operations

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"strings"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	opsdomain "github.com/rushairer/blog-backend/internal/operations/domain"
)

// CreateContentCandidateSet preserves the standalone Operations contract but
// delegates the SQL to a Tx-aware writer. ApprovalService can join the same
// transaction as its final Agent approval status without nested commits.
func (s *Service) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error {
	return s.transactor.Run(ctx, func(tx *sql.Tx) error {
		return s.CreateContentCandidateSetTx(ctx, tx, approval)
	})
}

func (s *Service) CreateContentCandidateSetTx(ctx context.Context, tx *sql.Tx, approval *domain.AgentApproval) error {
	if tx == nil || approval == nil {
		return errors.New("content candidate transaction and approval are required")
	}
	var payload struct {
		PostID     int64                        `json:"post_id"`
		FieldType  string                       `json:"field_type"`
		Candidates []opsdomain.ContentCandidate `json:"candidates"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return err
	}
	if payload.PostID <= 0 && approval.TargetID != nil {
		payload.PostID = *approval.TargetID
	}
	if payload.PostID <= 0 || len(payload.Candidates) == 0 {
		return errors.New("content candidate proposal requires a post and at least one candidate")
	}
	var before postdomain.Post
	if err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil {
		return err
	}
	beforeValue := ""
	switch payload.FieldType {
	case "title":
		beforeValue = before.Title
	case "summary":
		beforeValue = before.Summary
	case "cover_alt":
		beforeValue = before.CoverAlt
	default:
		return errors.New("unsupported candidate field")
	}
	var setID int64
	if err := tx.QueryRowContext(ctx, `INSERT INTO ai_content_candidate_sets
		(post_id,source_run_id,source_approval_id,field_type,before_value)
		VALUES($1,$2,$3,$4,$5) RETURNING id`,
		payload.PostID, approval.RunID, approval.ID, payload.FieldType, beforeValue).Scan(&setID); err != nil {
		return err
	}
	for _, item := range payload.Candidates {
		if _, err := tx.ExecContext(ctx, `INSERT INTO ai_content_candidates
			(candidate_set_id,value,rationale)VALUES($1,$2,$3)`,
			setID, item.Value, item.Rationale); err != nil {
			return err
		}
	}
	return nil
}

// approvalEffectExecutor lets the exact same Operations-owned insert execute
// on a standalone DB handle or the Agent-coordinated approval transaction.
type approvalEffectExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func createEditorialTaskOn(ctx context.Context, writer approvalEffectExecutor, approvalID int64, title, description, priority string) error {
	_, err := writer.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
		(title, description, priority, source_approval_id) VALUES ($1,$2,$3,$4)`,
		title, description, priority, approvalID)
	return err
}

func createReplyDraftOn(ctx context.Context, writer approvalEffectExecutor, approvalID, commentID int64, content string) error {
	_, err := writer.ExecContext(ctx, `INSERT INTO ai_comment_reply_drafts
		(comment_id, content, source_approval_id) VALUES ($1,$2,$3)`,
		commentID, content, approvalID)
	return err
}

func (s *Service) CreateEditorialTask(ctx context.Context, approvalID int64, title, description, priority string) error {
	return createEditorialTaskOn(ctx, s.db, approvalID, title, description, priority)
}

func (s *Service) CreateEditorialTaskTx(ctx context.Context, tx *sql.Tx, approvalID int64, title, description, priority string) error {
	if tx == nil {
		return errors.New("editorial task transaction is required")
	}
	return createEditorialTaskOn(ctx, tx, approvalID, title, description, priority)
}

func (s *Service) CreateReplyDraft(ctx context.Context, approvalID, commentID int64, content string) error {
	return createReplyDraftOn(ctx, s.db, approvalID, commentID, content)
}

func (s *Service) CreateReplyDraftTx(ctx context.Context, tx *sql.Tx, approvalID, commentID int64, content string) error {
	if tx == nil {
		return errors.New("reply draft transaction is required")
	}
	return createReplyDraftOn(ctx, tx, approvalID, commentID, content)
}

func (s *Service) CreateOperationalSuggestion(ctx context.Context, value *opsdomain.OperationalSuggestion) error {
	sum := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join([]string{value.SourceType, value.SourceKey, value.Title}, ":"))))
	_, err := s.db.ExecContext(ctx, `INSERT INTO ai_operational_suggestions
		(source_type,source_key,source_run_id,workflow_run_id,title,description,priority,evidence,
		 window_start,window_end,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT(dedupe_key) DO UPDATE SET evidence=EXCLUDED.evidence,updated_at=NOW()
		WHERE ai_operational_suggestions.status='new'`, value.SourceType, value.SourceKey, value.SourceRunID,
		value.WorkflowRunID, value.Title, value.Description, value.Priority, value.Evidence, value.WindowStart, value.WindowEnd, sum)
	return err
}
