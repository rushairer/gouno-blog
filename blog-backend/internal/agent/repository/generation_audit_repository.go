package repository

import (
	"context"
	"database/sql"

	"github.com/rushairer/blog-backend/internal/domain"
)

type GenerationAuditRepository struct {
	db *sql.DB
}

func NewGenerationAuditRepository(db *sql.DB) *GenerationAuditRepository {
	return &GenerationAuditRepository{db: db}
}

// RecordGenerationAudit deliberately stores no prompt, generated text, or
// binary media. Generation failures must not hide the primary user result, so
// callers treat a storage error as best-effort.
func (r *GenerationAuditRepository) RecordGenerationAudit(ctx context.Context, value *domain.GenerationAudit) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,agent_run_id,workflow_run_id,media_candidate_id,media_asset_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		value.Source, value.Operation, value.TemplateVersion, value.Provider, value.Model, value.InputTokens, value.OutputTokens,
		value.Status, value.ErrorCode, value.AgentRunID, value.WorkflowRunID, value.MediaCandidateID, value.MediaAssetID).Scan(&value.ID)
}
