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
