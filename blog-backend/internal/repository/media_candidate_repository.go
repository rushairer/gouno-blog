package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *AgentRepository) CreateMediaCandidate(ctx context.Context, approval *domain.AgentApproval) error {
	var payload struct {
		PostID   int64  `json:"post_id"`
		Format   string `json:"format"`
		Headline string `json:"headline"`
		Body     string `json:"body"`
		Platform string `json:"platform"`
		AltText  string `json:"alt_text"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return err
	}
	if payload.PostID <= 0 || payload.Format != "image_brief" || strings.TrimSpace(payload.Body) == "" {
		return errors.New("invalid media candidate")
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_media_candidates
		(post_id,source_run_id,source_approval_id,workflow_run_id,headline,brief,platform,alt_text,provider,model,input_tokens,output_tokens,post_version_token)
		SELECT $1,$2,$3,ar.workflow_run_id,$4,$5,$6,$7,ar.provider,ar.model,ar.input_tokens,ar.output_tokens,FLOOR(EXTRACT(EPOCH FROM p.updated_at))::bigint::text
		FROM ai_agent_runs ar JOIN posts p ON p.id=$1 WHERE ar.id=$2`,
		payload.PostID, approval.RunID, approval.ID, strings.TrimSpace(payload.Headline), strings.TrimSpace(payload.Body), strings.TrimSpace(payload.Platform), strings.TrimSpace(payload.AltText))
	return err
}

func (r *AgentRepository) CreateMediaCandidateFromRun(ctx context.Context, runID, postID int64, headline, brief, platform, altText string) (int64, *int64, error) {
	var candidateID int64
	var workflowRunID sql.NullInt64
	err := r.db.QueryRowContext(ctx, `INSERT INTO ai_media_candidates
		(post_id,source_run_id,source_approval_id,workflow_run_id,headline,brief,platform,alt_text,provider,model,input_tokens,output_tokens,post_version_token)
		SELECT $2,$1,NULL,ar.workflow_run_id,$3,$4,$5,$6,ar.provider,ar.model,ar.input_tokens,ar.output_tokens,FLOOR(EXTRACT(EPOCH FROM p.updated_at))::bigint::text
		FROM ai_agent_runs ar JOIN posts p ON p.id=$2 WHERE ar.id=$1
		ON CONFLICT (source_run_id, headline) WHERE source_approval_id IS NULL DO UPDATE SET
			brief=EXCLUDED.brief,platform=EXCLUDED.platform,alt_text=EXCLUDED.alt_text,
			input_tokens=EXCLUDED.input_tokens,output_tokens=EXCLUDED.output_tokens,post_version_token=EXCLUDED.post_version_token
		RETURNING id,workflow_run_id`, runID, postID, strings.TrimSpace(headline), strings.TrimSpace(brief), strings.TrimSpace(platform), strings.TrimSpace(altText)).Scan(&candidateID, &workflowRunID)
	if err != nil {
		return 0, nil, err
	}
	if workflowRunID.Valid {
		value := workflowRunID.Int64
		return candidateID, &value, nil
	}
	return candidateID, nil, nil
}

func (r *AgentRepository) ListMediaCandidates(ctx context.Context) ([]*domain.MediaCandidate, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,post_id,source_run_id,source_approval_id,headline,brief,platform,provider,model,input_tokens,output_tokens,media_asset_id,COALESCE((SELECT url FROM media_assets WHERE id=ai_media_candidates.media_asset_id),''),
		generation_status,safety_status,copyright_status,alt_text,reviewed_by,review_note,reviewed_at,created_at,workflow_run_id,COALESCE(workflow_step_id,''),interaction_task_id,COALESCE(post_version_token,''),generation_attempt,selected_at,applied_version_id,COALESCE(error_code,''),COALESCE(error_message,''),placement,COALESCE(anchor,''),selected,applied_at,generation_started_at,generation_deadline_at,cancelled_at,regeneration_instruction
		FROM ai_media_candidates ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.MediaCandidate, 0)
	for rows.Next() {
		var item domain.MediaCandidate
		if err := rows.Scan(&item.ID, &item.PostID, &item.SourceRunID, &item.SourceApprovalID, &item.Headline,
			&item.Brief, &item.Platform, &item.Provider, &item.Model, &item.InputTokens, &item.OutputTokens, &item.MediaAssetID, &item.MediaAssetURL, &item.GenerationStatus,
			&item.SafetyStatus, &item.CopyrightStatus, &item.AltText, &item.ReviewedBy, &item.ReviewNote,
			&item.ReviewedAt, &item.CreatedAt, &item.WorkflowRunID, &item.WorkflowStepID, &item.InteractionTaskID, &item.PostVersionToken, &item.GenerationAttempt, &item.SelectedAt, &item.AppliedVersionID, &item.ErrorCode, &item.ErrorMessage, &item.Placement, &item.Anchor, &item.Selected, &item.AppliedAt, &item.GenerationStartedAt, &item.GenerationDeadlineAt, &item.CancelledAt, &item.RegenerationInstruction); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *AgentRepository) SetMediaGenerationInstruction(ctx context.Context, id int64, instruction string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET regeneration_instruction=$2
		WHERE id=$1 AND generation_status IN ('brief_ready','ready_to_generate','failed','cancelled')`, id, instruction)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) GetMediaCandidate(ctx context.Context, id int64) (*domain.MediaCandidate, error) {
	rows, err := r.ListMediaCandidates(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range rows {
		if item.ID == id {
			return item, nil
		}
	}
	return nil, sql.ErrNoRows
}

func (r *AgentRepository) ListMediaCandidatesByWorkflowRun(ctx context.Context, runID int64) ([]*domain.MediaCandidate, error) {
	items, err := r.ListMediaCandidates(ctx)
	if err != nil {
		return nil, err
	}
	filtered := make([]*domain.MediaCandidate, 0)
	for _, item := range items {
		if item.WorkflowRunID != nil && *item.WorkflowRunID == runID {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func (r *AgentRepository) SelectMediaCandidate(ctx context.Context, id int64, placement, anchor string) error {
	if placement == "" {
		placement = "cover"
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET selected=TRUE,placement=$2,anchor=$3,selected_at=NOW()
		WHERE id=$1 AND generation_status='generated' AND media_asset_id IS NOT NULL`, id, placement, anchor)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) SelectMediaCandidates(ctx context.Context, selections []domain.MediaCandidateSelection) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, selection := range selections {
		placement := selection.Placement
		if placement == "" {
			placement = "cover"
		}
		result, execErr := tx.ExecContext(ctx, `UPDATE ai_media_candidates SET selected=TRUE,placement=$2,anchor=$3,selected_at=NOW()
			WHERE id=$1 AND generation_status='generated' AND media_asset_id IS NOT NULL`, selection.ID, placement, strings.TrimSpace(selection.Anchor))
		if execErr != nil {
			return execErr
		}
		if affected, _ := result.RowsAffected(); affected == 0 {
			return sql.ErrNoRows
		}
	}
	return tx.Commit()
}

func (r *AgentRepository) MarkMediaCandidateApplied(ctx context.Context, id, versionID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET applied_version_id=$2,applied_at=NOW() WHERE id=$1 AND selected=TRUE AND generation_status='generated'`, id, versionID)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) SyncPostVersionToken(ctx context.Context, postID int64, token string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET post_version_token=$2
		WHERE post_id=$1 AND applied_version_id IS NULL`, postID, token)
	return err
}

func (r *AgentRepository) AttachMediaAsset(ctx context.Context, candidateID, mediaAssetID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET media_asset_id=$2,generation_status='generated'
		WHERE id=$1 AND generation_status='ready_to_generate'
		AND EXISTS (SELECT 1 FROM media_assets WHERE id=$2)`, candidateID, mediaAssetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) ClaimMediaGeneration(ctx context.Context, id int64) (*domain.MediaCandidate, error) {
	var item domain.MediaCandidate
	err := r.db.QueryRowContext(ctx, `UPDATE ai_media_candidates SET generation_status='generating',generation_attempt=generation_attempt+1,error_code=NULL,error_message=NULL,generation_started_at=NOW(),generation_deadline_at=NOW()+INTERVAL '15 minutes',cancelled_at=NULL
		WHERE id=$1 AND generation_status IN ('brief_ready','ready_to_generate','failed','cancelled')
		RETURNING id,post_id,source_run_id,source_approval_id,headline,brief,platform,provider,model,input_tokens,output_tokens,media_asset_id,
		generation_status,safety_status,copyright_status,alt_text,reviewed_by,review_note,reviewed_at,created_at,generation_attempt,regeneration_instruction`, id).Scan(
		&item.ID, &item.PostID, &item.SourceRunID, &item.SourceApprovalID, &item.Headline, &item.Brief, &item.Platform,
		&item.Provider, &item.Model, &item.InputTokens, &item.OutputTokens, &item.MediaAssetID, &item.GenerationStatus,
		&item.SafetyStatus, &item.CopyrightStatus, &item.AltText, &item.ReviewedBy, &item.ReviewNote, &item.ReviewedAt, &item.CreatedAt, &item.GenerationAttempt, &item.RegenerationInstruction)
	return &item, err
}

func (r *AgentRepository) CompleteMediaGeneration(ctx context.Context, candidateID, mediaAssetID int64, failed bool) error {
	status := "generated"
	if failed {
		status = "failed"
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status=$2, media_asset_id=CASE WHEN $3 > 0 THEN $3 ELSE media_asset_id END
		WHERE id=$1 AND generation_status='generating'`, candidateID, status, mediaAssetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) RecordMediaGenerationError(ctx context.Context, candidateID int64, code, message string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status='failed',error_code=$2,error_message=$3 WHERE id=$1 AND generation_status='generating'`, candidateID, code, message)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	var runID sql.NullInt64
	if err := r.db.QueryRowContext(ctx, `SELECT workflow_run_id FROM ai_media_candidates WHERE id=$1`, candidateID).Scan(&runID); err == nil && runID.Valid {
		_, _ = r.db.ExecContext(ctx, `INSERT INTO workflow_run_events(workflow_run_id,event_type,payload) VALUES($1,$2,jsonb_build_object('candidate_id',$3,'error_code',$4,'error_message',$5))`, runID.Int64, generationFailureEvent(code), candidateID, code, message)
	}
	return nil
}

func generationFailureEvent(code string) string {
	if code == "image_generation_timeout" {
		return "image_generation_timed_out"
	}
	return "image_generation_failed"
}

func (r *AgentRepository) CancelMediaGeneration(ctx context.Context, candidateID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status='cancelled',cancelled_at=NOW(),error_code='cancelled',error_message='generation cancelled by administrator'
		WHERE id=$1 AND generation_status IN ('ready_to_generate','generating')`, candidateID)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) ReviewMediaCandidate(ctx context.Context, id int64, action, reviewer, note string) error {
	status, safety, copyright := "", "", ""
	switch action {
	case "ready":
		status, safety, copyright = "ready_to_generate", "passed", "passed"
	case "reject":
		status, safety, copyright = "rejected", "flagged", "flagged"
	default:
		return errors.New("invalid media candidate review")
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status=$2,safety_status=$3,
		copyright_status=$4,reviewed_by=$5,review_note=$6,reviewed_at=NOW()
		WHERE id=$1 AND generation_status='brief_ready'`, id, status, safety, copyright, reviewer, note)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) RejectMediaCandidate(ctx context.Context, id int64, reason string) error {
	if reason == "" {
		reason = "rejected by administrator"
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status='rejected',selected=FALSE,reviewed_at=NOW(),review_note=$2
		WHERE id=$1 AND applied_version_id IS NULL AND generation_status NOT IN ('failed','cancelled','rejected')`, id, reason)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AgentRepository) RejectMediaCandidates(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, id := range ids {
		result, execErr := tx.ExecContext(ctx, `UPDATE ai_media_candidates SET generation_status='rejected',selected=FALSE,reviewed_at=NOW(),review_note='rejected by administrator'
			WHERE id=$1 AND applied_version_id IS NULL AND generation_status NOT IN ('failed','cancelled','rejected')`, id)
		if execErr != nil {
			return execErr
		}
		if n, _ := result.RowsAffected(); n == 0 {
			return sql.ErrNoRows
		}
	}
	return tx.Commit()
}
