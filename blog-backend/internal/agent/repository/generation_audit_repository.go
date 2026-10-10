package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

type GenerationAuditRepository struct {
	db *sql.DB
}

func NewGenerationAuditRepository(db *sql.DB) *GenerationAuditRepository {
	return &GenerationAuditRepository{db: db}
}

// RecordGenerationAudit stores no prompt, generated text, credential or binary.
// A governed image request must confirm a new started row BEFORE dispatch. Its
// ID and exact candidate/attempt pair permit one terminal transition only.
// Editor/legacy observations remain append-only and best-effort. No audit write
// mutates the candidate or authorizes a provider retry.
func (r *GenerationAuditRepository) RecordGenerationAudit(ctx context.Context, value *domain.GenerationAudit) error {
	if value == nil {
		return errors.New("generation audit is required")
	}
	if value.GenerationAttempt != nil {
		if *value.GenerationAttempt <= 0 || value.MediaCandidateID == nil || *value.MediaCandidateID <= 0 ||
			value.Source != "agent_candidate" || value.Operation != "media.generate_candidate" {
			return errors.New("invalid generation audit attempt identity")
		}
		if value.ID > 0 {
			if value.Status != "succeeded" && value.Status != domain.MediaGenerationOutcomeUncertainCode {
				return errors.New("invalid terminal generation audit status")
			}
			return r.db.QueryRowContext(ctx, `UPDATE ai_generation_audits
				SET status=$4,error_code=$5,media_asset_id=$6,input_tokens=$7,output_tokens=$8
				WHERE id=$1 AND media_candidate_id=$2 AND generation_attempt=$3
				  AND source='agent_candidate' AND operation='media.generate_candidate' AND status='started'
				RETURNING id`, value.ID, value.MediaCandidateID, value.GenerationAttempt,
				value.Status, value.ErrorCode, value.MediaAssetID, value.InputTokens, value.OutputTokens).Scan(&value.ID)
		}
	}
	if value.ID != 0 || (value.Status == "started" && value.GenerationAttempt == nil) {
		return errors.New("invalid generation audit lifecycle")
	}
	if value.GenerationAttempt != nil && value.Status == "started" {
		// SELECT the claimed identity, not merely the ID. A cancelled, uncertain
		// or superseded attempt cannot obtain a new dispatch audit. A unique
		// index prevents a second dispatch from reusing the same attempt.
		return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
			(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,agent_run_id,workflow_run_id,media_candidate_id,media_asset_id,generation_attempt)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,c.source_run_id,c.workflow_run_id,c.id,$10,c.generation_attempt
			FROM ai_media_candidates c
			WHERE c.id=$11 AND c.generation_attempt=$12 AND c.generation_status='generating'
			  AND COALESCE(c.error_code,'')=''
			RETURNING id`, value.Source, value.Operation, value.TemplateVersion,
			value.Provider, value.Model, value.InputTokens, value.OutputTokens,
			value.Status, value.ErrorCode, value.MediaAssetID, value.MediaCandidateID, value.GenerationAttempt).Scan(&value.ID)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,agent_run_id,workflow_run_id,media_candidate_id,media_asset_id,generation_attempt)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
		value.Source, value.Operation, value.TemplateVersion, value.Provider, value.Model, value.InputTokens, value.OutputTokens,
		value.Status, value.ErrorCode, value.AgentRunID, value.WorkflowRunID, value.MediaCandidateID, value.MediaAssetID, value.GenerationAttempt).Scan(&value.ID)
}
