package repository

import (
	"context"
	"encoding/json"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/domain"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

// Media Candidate persistence now belongs to the Agent capability. This facade
// preserves existing AgentRepository consumers while cross-capability Workflow
// event persistence is routed through the canonical Workflow repository.
func (r *AgentRepository) mediaCandidates() *agentrepository.MediaCandidateRepository {
	return agentrepository.NewMediaCandidateRepository(r.db)
}

func (r *AgentRepository) CreateMediaCandidate(ctx context.Context, approval *domain.AgentApproval) error {
	return r.mediaCandidates().CreateMediaCandidate(ctx, approval)
}

func (r *AgentRepository) CreateMediaCandidateFromRun(ctx context.Context, runID, postID int64, headline, brief, platform, altText string) (int64, *int64, error) {
	return r.mediaCandidates().CreateMediaCandidateFromRun(ctx, runID, postID, headline, brief, platform, altText)
}

func (r *AgentRepository) ListMediaCandidates(ctx context.Context) ([]*domain.MediaCandidate, error) {
	return r.mediaCandidates().ListMediaCandidates(ctx)
}

func (r *AgentRepository) SetMediaGenerationInstruction(ctx context.Context, id int64, instruction string) error {
	return r.mediaCandidates().SetMediaGenerationInstruction(ctx, id, instruction)
}

func (r *AgentRepository) GetMediaCandidate(ctx context.Context, id int64) (*domain.MediaCandidate, error) {
	return r.mediaCandidates().GetMediaCandidate(ctx, id)
}

func (r *AgentRepository) ListMediaCandidatesByWorkflowRun(ctx context.Context, runID int64) ([]*domain.MediaCandidate, error) {
	return r.mediaCandidates().ListMediaCandidatesByWorkflowRun(ctx, runID)
}

func (r *AgentRepository) SelectMediaCandidate(ctx context.Context, id int64, placement, anchor string) error {
	return r.mediaCandidates().SelectMediaCandidate(ctx, id, placement, anchor)
}

func (r *AgentRepository) SelectMediaCandidates(ctx context.Context, selections []domain.MediaCandidateSelection) error {
	return r.mediaCandidates().SelectMediaCandidates(ctx, selections)
}

func (r *AgentRepository) MarkMediaCandidateApplied(ctx context.Context, id, versionID int64) error {
	return r.mediaCandidates().MarkMediaCandidateApplied(ctx, id, versionID)
}

func (r *AgentRepository) SyncPostVersionToken(ctx context.Context, postID int64, token string) error {
	return r.mediaCandidates().SyncPostVersionToken(ctx, postID, token)
}

func (r *AgentRepository) AttachMediaAsset(ctx context.Context, candidateID, mediaAssetID int64) error {
	return r.mediaCandidates().AttachMediaAsset(ctx, candidateID, mediaAssetID)
}

func (r *AgentRepository) ClaimMediaGeneration(ctx context.Context, id int64) (*domain.MediaCandidate, error) {
	return r.mediaCandidates().ClaimMediaGeneration(ctx, id)
}

func (r *AgentRepository) CompleteMediaGeneration(ctx context.Context, candidateID, mediaAssetID int64, failed bool) error {
	return r.mediaCandidates().CompleteMediaGeneration(ctx, candidateID, mediaAssetID, failed)
}

func (r *AgentRepository) RecordMediaGenerationError(ctx context.Context, candidateID int64, code, message string) error {
	workflowRunID, err := r.mediaCandidates().RecordMediaGenerationError(ctx, candidateID, code, message)
	if err != nil {
		return err
	}
	if workflowRunID == nil {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"candidate_id":  candidateID,
		"error_code":    code,
		"error_message": message,
	})
	_ = workflowrepository.NewInteractionRepository(r.db).AppendWorkflowRunEvent(ctx, &domain.WorkflowRunEvent{
		WorkflowRunID: workflowRunID,
		EventType:     generationFailureEvent(code),
		Payload:       payload,
	})
	return nil
}

func generationFailureEvent(code string) string {
	if code == "image_generation_timeout" {
		return "image_generation_timed_out"
	}
	return "image_generation_failed"
}

func (r *AgentRepository) CancelMediaGeneration(ctx context.Context, candidateID int64) error {
	return r.mediaCandidates().CancelMediaGeneration(ctx, candidateID)
}

func (r *AgentRepository) ReviewMediaCandidate(ctx context.Context, id int64, action string, reviewerPrincipalID int64, note string) error {
	return r.mediaCandidates().ReviewMediaCandidate(ctx, id, action, reviewerPrincipalID, note)
}

func (r *AgentRepository) RejectMediaCandidate(ctx context.Context, id int64, reason string) error {
	return r.mediaCandidates().RejectMediaCandidate(ctx, id, reason)
}

func (r *AgentRepository) RejectMediaCandidates(ctx context.Context, ids []int64) error {
	return r.mediaCandidates().RejectMediaCandidates(ctx, ids)
}
