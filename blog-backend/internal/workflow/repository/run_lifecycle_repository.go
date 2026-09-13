package repository

import (
	"context"
	"database/sql"
)

// RunLifecycleRepository owns Workflow run lifecycle persistence. Transactions
// are supplied by the application coordinator, never started here.
type RunLifecycleRepository struct{}

func NewRunLifecycleRepository() *RunLifecycleRepository { return &RunLifecycleRepository{} }

func (r *RunLifecycleRepository) CancelRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	result, err := tx.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='cancelled',finished_at=NOW(),error_code='cancelled',error_message='cancelled by administrator'
 WHERE id=$1 AND status IN ('queued','running','awaiting_approval','waiting_for_user')`, runID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return sql.ErrNoRows
	}
	_, err = tx.ExecContext(ctx, `UPDATE workflow_interaction_tasks SET status='cancelled',updated_at=NOW()
 WHERE workflow_run_id=$1 AND status='pending'`, runID)
	return err
}

func (r *RunLifecycleRepository) LockRunStatusTx(ctx context.Context, tx *sql.Tx, runID int64) (string, error) {
	var status string
	err := tx.QueryRowContext(ctx, `SELECT status FROM ai_workflow_runs WHERE id=$1 FOR UPDATE`, runID).Scan(&status)
	return status, err
}

func (r *RunLifecycleRepository) DeleteRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return sql.ErrNoRows
	}
	return nil
}
