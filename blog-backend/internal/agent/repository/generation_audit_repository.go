package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

type GenerationAuditRepository struct {
	db *sql.DB
}

func NewGenerationAuditRepository(db *sql.DB) *GenerationAuditRepository {
	return &GenerationAuditRepository{db: db}
}

func optionalAuditString(value string) any {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return value
}

// RecordGenerationAudit stores no prompt, generated text, credential or binary.
// A governed image request must confirm a new started row BEFORE dispatch. Its
// ID and exact candidate/attempt pair permit one terminal transition only.
// The same started row may acquire one exact object locator before object-store
// mutation. Editor/legacy observations remain append-only and best-effort.
// No audit write mutates the candidate or authorizes a provider retry.
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
			if value.Status == "started" {
				if strings.TrimSpace(value.StorageName) == "" || strings.TrimSpace(value.StorageURL) == "" {
					return errors.New("generation object locator is required")
				}
				// Persist the exact planned object location before Put. It is an
				// investigation locator, not proof that bytes were stored.
				return r.db.QueryRowContext(ctx, `UPDATE ai_generation_audits
					SET storage_name=$4,storage_url=$5
					WHERE id=$1 AND media_candidate_id=$2 AND generation_attempt=$3
					  AND source='agent_candidate' AND operation='media.generate_candidate' AND status='started'
					  AND storage_name IS NULL AND storage_url IS NULL
					RETURNING id`, value.ID, value.MediaCandidateID, value.GenerationAttempt,
					value.StorageName, value.StorageURL).Scan(&value.ID)
			}
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
		if value.ProviderProfileID == nil || *value.ProviderProfileID <= 0 ||
			strings.TrimSpace(value.ProviderVendor) == "" ||
			len(value.ProviderConfigFingerprint) != 64 || len(value.DispatchID) != 32 {
			return errors.New("generation provider evidence is required")
		}
		// SELECT the claimed identity, not merely the ID. A cancelled, uncertain
		// or superseded attempt cannot obtain a new dispatch audit. A unique
		// candidate/attempt index and unique local dispatch ID prevent a second
		// dispatch from reusing the same durable identity.
		return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
			(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,
			 agent_run_id,workflow_run_id,media_candidate_id,media_asset_id,generation_attempt,
			 provider_profile_id,provider_vendor,provider_config_fingerprint,dispatch_id)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,c.source_run_id,c.workflow_run_id,c.id,$10,c.generation_attempt,
			       $13,$14,$15,$16
			FROM ai_media_candidates c
			WHERE c.id=$11 AND c.generation_attempt=$12 AND c.generation_status='generating'
			  AND COALESCE(c.error_code,'')=''
			RETURNING id`, value.Source, value.Operation, value.TemplateVersion,
			value.Provider, value.Model, value.InputTokens, value.OutputTokens,
			value.Status, value.ErrorCode, value.MediaAssetID, value.MediaCandidateID, value.GenerationAttempt,
			value.ProviderProfileID, value.ProviderVendor, value.ProviderConfigFingerprint, value.DispatchID).Scan(&value.ID)
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,input_tokens,output_tokens,status,error_code,
		 agent_run_id,workflow_run_id,media_candidate_id,media_asset_id,generation_attempt,
		 provider_profile_id,provider_vendor,provider_config_fingerprint,dispatch_id,storage_name,storage_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
		value.Source, value.Operation, value.TemplateVersion, value.Provider, value.Model, value.InputTokens, value.OutputTokens,
		value.Status, value.ErrorCode, value.AgentRunID, value.WorkflowRunID, value.MediaCandidateID, value.MediaAssetID, value.GenerationAttempt,
		value.ProviderProfileID, optionalAuditString(value.ProviderVendor), optionalAuditString(value.ProviderConfigFingerprint),
		optionalAuditString(value.DispatchID), optionalAuditString(value.StorageName), optionalAuditString(value.StorageURL)).Scan(&value.ID)
}
