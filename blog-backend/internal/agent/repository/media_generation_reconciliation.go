package repository

import (
	"context"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

const maxMediaGenerationReconciliationRows = 100

// ListMediaGenerationReconciliation is intentionally READ ONLY. A deadline
// crossing is an investigation signal, not proof that the provider stopped.
// The query never leases, retries, resets or transitions any generation.
func (r *MediaCandidateRepository) ListMediaGenerationReconciliation(ctx context.Context, limit int) ([]*domain.MediaGenerationReconciliation, error) {
	if limit < 1 || limit > maxMediaGenerationReconciliationRows {
		return nil, errors.New("media generation reconciliation limit must be 1..100")
	}
	rows, err := r.db.QueryContext(ctx, `
		WITH needs_review AS (
			SELECT id,post_id,source_run_id,workflow_run_id,generation_attempt,
			       generation_started_at,generation_deadline_at,media_asset_id,
			       COALESCE(error_code,'') AS error_code,
			       COALESCE(generation_deadline_at, generation_started_at + INTERVAL '15 minutes',
			                created_at + INTERVAL '15 minutes') AS review_deadline
			FROM ai_media_candidates
			WHERE generation_status='generating'
			  AND (error_code='outcome_uncertain'
			       OR COALESCE(generation_deadline_at, generation_started_at + INTERVAL '15 minutes',
			                   created_at + INTERVAL '15 minutes') <= NOW())
			ORDER BY review_deadline ASC,id ASC
			LIMIT $1
		)
		SELECT c.id,c.post_id,c.source_run_id,c.workflow_run_id,c.generation_attempt,
		       c.generation_started_at,c.generation_deadline_at,c.media_asset_id,c.error_code,
		       a.id,COALESCE(a.status,''),COALESCE(a.error_code,''),
		       a.media_asset_id,a.created_at
		FROM needs_review c
		LEFT JOIN LATERAL (
			SELECT id,status,error_code,media_asset_id,created_at
			FROM ai_generation_audits
			WHERE media_candidate_id=c.id AND operation='media.generate_candidate'
			ORDER BY created_at DESC,id DESC LIMIT 1
		) a ON true
		ORDER BY c.review_deadline ASC,c.id ASC
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*domain.MediaGenerationReconciliation, 0)
	for rows.Next() {
		var item domain.MediaGenerationReconciliation
		if err := rows.Scan(&item.CandidateID,&item.PostID,&item.SourceRunID,
			&item.WorkflowRunID,&item.GenerationAttempt,&item.GenerationStartedAt,
			&item.GenerationDeadlineAt,&item.MediaAssetID,&item.ErrorCode,
			&item.LatestAuditID,&item.LatestAuditStatus,&item.LatestAuditErrorCode,
			&item.LatestAuditMediaAssetID,&item.LatestAuditAt); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}
