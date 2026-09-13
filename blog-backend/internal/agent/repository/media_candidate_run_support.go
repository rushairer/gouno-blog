package repository

import (
	"context"
	"database/sql"
)

// SyncRunTokenUsage keeps generated media metadata aligned with the source
// Agent Run without giving Run persistence ownership of the media table.
func (r *MediaCandidateRepository) SyncRunTokenUsage(ctx context.Context, runID, inputTokens, outputTokens int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET input_tokens=$2,output_tokens=$3 WHERE source_run_id=$1`, runID, inputTokens, outputTokens)
	return err
}

// DeleteBySourceRunTx participates in the caller-owned Run deletion
// transaction while keeping ai_media_candidates SQL inside its capability owner.
func (r *MediaCandidateRepository) DeleteBySourceRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM ai_media_candidates WHERE source_run_id=$1`, runID)
	return err
}

// CancelByWorkflowRunTx updates Agent-owned generation state only.
func (r *MediaCandidateRepository) CancelByWorkflowRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status='cancelled',cancelled_at=NOW(),error_code='cancelled',error_message='workflow cancelled by administrator'
 WHERE workflow_run_id=$1 AND generation_status IN ('brief_ready','ready_to_generate','generating','generated') AND applied_version_id IS NULL`, runID)
	return err
}

func (r *MediaCandidateRepository) DeleteByWorkflowRunTx(ctx context.Context, tx *sql.Tx, runID int64) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM ai_media_candidates WHERE workflow_run_id=$1 OR source_run_id IN (SELECT id FROM ai_agent_runs WHERE workflow_run_id=$1)`, runID)
	return err
}
