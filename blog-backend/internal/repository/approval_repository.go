package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

const approvalColumns = `ap.id, ap.run_id, ap.tool_call_id, ap.action_type, ap.target_type,
	ap.target_id, ap.proposed_payload, ap.before_snapshot, ap.status, ap.reviewed_by,
	ap.review_note, ap.reviewed_at, ap.expires_at, ap.created_at`

func scanApproval(scanner interface{ Scan(...any) error }) (*domain.AgentApproval, error) {
	var approval domain.AgentApproval
	var before []byte
	err := scanner.Scan(
		&approval.ID, &approval.RunID, &approval.ToolCallID, &approval.ActionType,
		&approval.TargetType, &approval.TargetID, &approval.ProposedPayload, &before,
		&approval.Status, &approval.ReviewedBy, &approval.ReviewNote, &approval.ReviewedAt,
		&approval.ExpiresAt, &approval.CreatedAt,
	)
	approval.BeforeSnapshot = before
	return &approval, err
}

func (r *AgentRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id, tool_call_id, action_type, target_type, target_id, proposed_payload, before_snapshot)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, status, expires_at, created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType,
		approval.TargetID, approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot),
	).Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *AgentRepository) CreateApprovalTx(ctx context.Context, tx *sql.Tx, approval *domain.AgentApproval) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,target_id,proposed_payload,before_snapshot)
		VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,expires_at,created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType, approval.TargetID,
		approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot)).
		Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *AgentRepository) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error {
	var payload struct {
		PostID     int64                     `json:"post_id"`
		FieldType  string                    `json:"field_type"`
		Candidates []domain.ContentCandidate `json:"candidates"`
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
	var before domain.Post
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
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	var setID int64
	if err = tx.QueryRowContext(ctx, `INSERT INTO ai_content_candidate_sets
		(post_id,source_run_id,source_approval_id,field_type,before_value)
		VALUES($1,$2,$3,$4,$5) RETURNING id`, payload.PostID, approval.RunID, approval.ID, payload.FieldType, beforeValue).Scan(&setID); err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, item := range payload.Candidates {
		if _, err = tx.ExecContext(ctx, `INSERT INTO ai_content_candidates
		(candidate_set_id,value,rationale)VALUES($1,$2,$3)`, setID, item.Value, item.Rationale); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (r *AgentRepository) GetApproval(ctx context.Context, id int64) (*domain.AgentApproval, error) {
	return scanApproval(r.db.QueryRowContext(ctx, `SELECT `+approvalColumns+`
		FROM ai_approvals ap WHERE ap.id=$1`, id))
}

func (r *AgentRepository) ListApprovals(ctx context.Context, status string, limit, offset int) ([]*domain.AgentApproval, int, error) {
	where := ""
	args := []any{limit, offset}
	countQuery := `SELECT COUNT(*) FROM ai_approvals ap`
	countArgs := []any{}
	if status != "" && status != "all" {
		if status == string(domain.ApprovalPending) {
			where = " WHERE ap.status IN ('pending','failed')"
			countQuery += " WHERE ap.status IN ('pending','failed')"
		} else {
			where = " WHERE ap.status=$3"
			args = append(args, status)
			countQuery += " WHERE ap.status=$1"
			countArgs = append(countArgs, status)
		}
	}
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+approvalColumns+`
		FROM ai_approvals ap`+where+` ORDER BY ap.created_at DESC LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := make([]*domain.AgentApproval, 0)
	for rows.Next() {
		approval, err := scanApproval(rows)
		if err != nil {
			return nil, 0, err
		}
		result = append(result, approval)
	}
	return result, total, rows.Err()
}

func (r *AgentRepository) ClaimApproval(ctx context.Context, id int64, reviewer, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='approved', reviewed_by=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status IN ('pending','failed') AND expires_at > NOW()`, id, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) CompleteApproval(ctx context.Context, id int64, status domain.ApprovalStatus, note string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET status=$2,
		review_note=CASE WHEN $3='' THEN review_note ELSE $3 END WHERE id=$1`, id, status, note)
	return err
}

func (r *AgentRepository) SetApprovalTarget(ctx context.Context, id, targetID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET target_id=$2 WHERE id=$1 AND target_id IS NULL`, id, targetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) RejectApproval(ctx context.Context, id int64, reviewer, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='rejected', reviewed_by=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status IN ('pending','failed')`, id, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
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
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
		(title, description, priority, source_approval_id) VALUES ($1,$2,$3,$4)`,
		title, description, priority, approvalID)
	return err
}

func (r *AgentRepository) CreateReplyDraft(ctx context.Context, approvalID, commentID int64, content string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_comment_reply_drafts
		(comment_id, content, source_approval_id) VALUES ($1,$2,$3)`,
		commentID, content, approvalID)
	return err
}

func (r *AgentRepository) CreateOperationalSuggestion(ctx context.Context, value *domain.OperationalSuggestion) error {
	sum := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join([]string{value.SourceType, value.SourceKey, value.Title}, ":"))))
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_operational_suggestions
		(source_type,source_key,source_run_id,workflow_run_id,title,description,priority,evidence,
		 window_start,window_end,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT(dedupe_key) DO UPDATE SET evidence=EXCLUDED.evidence,updated_at=NOW()
		WHERE ai_operational_suggestions.status='new'`, value.SourceType, value.SourceKey, value.SourceRunID,
		value.WorkflowRunID, value.Title, value.Description, value.Priority, value.Evidence, value.WindowStart, value.WindowEnd, sum)
	return err
}
