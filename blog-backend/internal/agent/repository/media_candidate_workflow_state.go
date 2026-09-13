package repository

import (
	"context"
	"database/sql"
)

// HasWorkflowRunCandidatesTx answers a Workflow coordinator question while
// keeping Media Candidate persistence ownership inside the Agent capability.
func (r *MediaCandidateRepository) HasWorkflowRunCandidatesTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
	var exists bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_media_candidates WHERE workflow_run_id=$1)`, runID).Scan(&exists)
	return exists, err
}

// WorkflowRunCandidateSummaryTx returns only the aggregate state needed by the
// Workflow coordinator; callers never query Agent-owned rows directly.
func (r *MediaCandidateRepository) WorkflowRunCandidateSummaryTx(ctx context.Context, tx *sql.Tx, runID int64) (total, pending, applied int, err error) {
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*),
        COUNT(*) FILTER (WHERE applied_version_id IS NULL AND generation_status NOT IN ('rejected','failed','cancelled')),
        COUNT(*) FILTER (WHERE applied_version_id IS NOT NULL)
        FROM ai_media_candidates WHERE workflow_run_id=$1`, runID).
		Scan(&total, &pending, &applied)
	return
}

func (r *MediaCandidateRepository) HasPendingWorkflowRunCandidates(ctx context.Context, runID int64) (bool, error) {
	var pending bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_media_candidates
        WHERE workflow_run_id=$1 AND applied_version_id IS NULL
        AND generation_status NOT IN ('rejected','failed','cancelled'))`, runID).Scan(&pending)
	return pending, err
}
