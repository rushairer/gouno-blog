package agent

import (
	"context"
	"errors"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

var errImageAuditUnconfirmed = errors.New("image generation audit unconfirmed; provider was not called")

// A claim's attempt number is carried explicitly by the trusted service caller.
// Never look up the current attempt after a provider finishes: cancellation and
// regeneration can have advanced it while the old worker was still running.
func validateImageGenerationIdentity(req ImageGenerationRequest) error {
	if req.Source == "agent_candidate" || req.Operation == "media.generate_candidate" ||
		req.MediaCandidateID != nil || req.GenerationAttempt != nil {
		if req.Source != "agent_candidate" || req.Operation != "media.generate_candidate" ||
			req.MediaCandidateID == nil || *req.MediaCandidateID <= 0 ||
			req.GenerationAttempt == nil || *req.GenerationAttempt <= 0 {
			return ErrInvalid
		}
	}
	return nil
}

// requestAuditedImage does not retry. Failure (including an ambiguous INSERT
// acknowledgement) aborts BEFORE the external call. A confirmed started row
// means dispatch was permitted, not proof the provider received or billed it.
func (s *GenerationService) requestAuditedImage(ctx context.Context, req *ImageGenerationRequest, providerName, model string, generator provider.ImageGenerator) (provider.ImageResult, error) {
	if req == nil || generator == nil {
		return provider.ImageResult{}, ErrInvalid
	}
	if err := validateImageGenerationIdentity(*req); err != nil {
		return provider.ImageResult{}, err
	}
	if req.GenerationAttempt != nil {
		if s == nil || s.repo == nil {
			return provider.ImageResult{}, errImageAuditUnconfirmed
		}
		audit := domain.GenerationAudit{
			Source: req.Source, Operation: req.Operation, TemplateVersion: editorTemplateVersion,
			Provider: providerName, Model: model, Status: "started",
			AgentRunID: req.AgentRunID, WorkflowRunID: req.WorkflowRunID,
			MediaCandidateID: req.MediaCandidateID, GenerationAttempt: req.GenerationAttempt,
		}
		auditCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := s.repo.RecordGenerationAudit(auditCtx, &audit)
		cancel()
		if err != nil || audit.ID <= 0 {
			return provider.ImageResult{}, errImageAuditUnconfirmed
		}
		req.auditID = audit.ID
	}
	return generator.GenerateImage(ctx, provider.ImageRequest{Prompt: cleanImagePrompt(req.Prompt)})
}
