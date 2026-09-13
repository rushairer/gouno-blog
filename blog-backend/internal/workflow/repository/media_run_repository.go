package repository

import (
	"context"
	"database/sql"
)

// MediaRunRepository owns only Workflow Run persistence used by the
// cross-capability media/run coordinator. Transactions are supplied by the
// application coordinator and are never started here.
type MediaRunRepository struct{}

func NewMediaRunRepository() *MediaRunRepository { return &MediaRunRepository{} }

func (r *MediaRunRepository) ResumeAfterApprovalTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
	result, err := tx.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='queued',finished_at=NULL,error_code=NULL,error_message=NULL
        WHERE id=$1 AND status='awaiting_approval'`, runID)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
}

func (r *MediaRunRepository) SetMediaRunStateTx(ctx context.Context, tx *sql.Tx, runID int64, status string, finished bool) (bool, error) {
	result, err := tx.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2,finished_at=CASE WHEN $3 THEN NOW() ELSE NULL END
        WHERE id=$1 AND status NOT IN ('failed','cancelled','succeeded')`, runID, status, finished)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
}

func (r *MediaRunRepository) RunExistsTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
	var exists bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs WHERE id=$1)`, runID).Scan(&exists)
	return exists, err
}
