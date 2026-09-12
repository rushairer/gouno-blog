package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

const approvalColumns = `ap.id, ap.run_id, ap.tool_call_id, ap.action_type, ap.target_type,
	ap.target_id, ap.proposed_payload, ap.before_snapshot, ap.status, ap.reviewed_by_principal_id,
	ap.review_note, ap.reviewed_at, ap.expires_at, ap.created_at`

type ApprovalRepository struct {
	db *sql.DB
}

func NewApprovalRepository(db *sql.DB) *ApprovalRepository {
	return &ApprovalRepository{db: db}
}

func scanApproval(scanner interface{ Scan(...any) error }) (*domain.AgentApproval, error) {
	var approval domain.AgentApproval
	var before []byte
	err := scanner.Scan(
		&approval.ID, &approval.RunID, &approval.ToolCallID, &approval.ActionType,
		&approval.TargetType, &approval.TargetID, &approval.ProposedPayload, &before,
		&approval.Status, &approval.ReviewedByPrincipalID, &approval.ReviewNote, &approval.ReviewedAt,
		&approval.ExpiresAt, &approval.CreatedAt,
	)
	approval.BeforeSnapshot = before
	return &approval, err
}

func nullableJSON(value json.RawMessage) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func (r *ApprovalRepository) CreateApproval(ctx context.Context, approval *domain.AgentApproval) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id, tool_call_id, action_type, target_type, target_id, proposed_payload, before_snapshot)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, status, expires_at, created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType,
		approval.TargetID, approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot),
	).Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *ApprovalRepository) CreateApprovalTx(ctx context.Context, tx *sql.Tx, approval *domain.AgentApproval) error {
	return tx.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,target_id,proposed_payload,before_snapshot)
		VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,expires_at,created_at`,
		approval.RunID, approval.ToolCallID, approval.ActionType, approval.TargetType, approval.TargetID,
		approval.ProposedPayload, nullableJSON(approval.BeforeSnapshot)).
		Scan(&approval.ID, &approval.Status, &approval.ExpiresAt, &approval.CreatedAt)
}

func (r *ApprovalRepository) GetApproval(ctx context.Context, id int64) (*domain.AgentApproval, error) {
	return scanApproval(r.db.QueryRowContext(ctx, `SELECT `+approvalColumns+`
		FROM ai_approvals ap WHERE ap.id=$1`, id))
}

func (r *ApprovalRepository) ListApprovals(ctx context.Context, status string, limit, offset int) ([]*domain.AgentApproval, int, error) {
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

func (r *ApprovalRepository) ClaimApproval(ctx context.Context, id int64, reviewerPrincipalID int64, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='approved', reviewed_by_principal_id=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status IN ('pending','failed') AND expires_at > NOW()`, id, reviewerPrincipalID, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *ApprovalRepository) CompleteApproval(ctx context.Context, id int64, status domain.ApprovalStatus, note string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET status=$2,
		review_note=CASE WHEN $3='' THEN review_note ELSE $3 END WHERE id=$1`, id, status, note)
	return err
}

func (r *ApprovalRepository) SetApprovalTarget(ctx context.Context, id, targetID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET target_id=$2 WHERE id=$1 AND target_id IS NULL`, id, targetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *ApprovalRepository) RejectApproval(ctx context.Context, id int64, reviewerPrincipalID int64, note string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_approvals SET
		status='rejected', reviewed_by_principal_id=$2, review_note=$3, reviewed_at=NOW()
		WHERE id=$1 AND status IN ('pending','failed')`, id, reviewerPrincipalID, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
