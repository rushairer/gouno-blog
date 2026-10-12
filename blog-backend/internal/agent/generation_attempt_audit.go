package agent

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
)

var (
	errImageAuditUnconfirmed          = fmt.Errorf("image generation audit unconfirmed; provider was not called")
	errImageObjectEvidenceUnconfirmed = fmt.Errorf("image object-location evidence unconfirmed; object was not written")
)

// A claim's attempt number is carried explicitly by the trusted service caller.
// Never look up the current attempt after external work: cancellation and
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

func newGenerationDispatchID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

// providerConfigFingerprint is intentionally one-way and contains no plaintext
// credential or private endpoint in the audit row. It changes when the selected
// profile, credential version or request-shaping configuration changes.
func providerConfigFingerprint(profile *providerdomain.ProviderProfile) string {
	if profile == nil {
		return ""
	}
	raw := fmt.Sprintf("%d\x00%s\x00%s\x00%s\x00%s\x00%s\x00%s\x00%d\x00%d\x00%s\x00%d\x00%d",
		profile.ID, profile.ProviderType, profile.Vendor, strings.TrimSpace(profile.BaseURL),
		profile.Model, profile.ProtocolMode, profile.StreamMode, profile.RequestTimeoutSeconds,
		profile.MaxOutputTokens, profile.APIKeyLast4, profile.KeyVersion, profile.UpdatedAt.UTC().UnixNano())
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
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
		if s == nil || s.repo == nil || req.providerProfileID == nil || *req.providerProfileID <= 0 ||
			strings.TrimSpace(req.providerVendor) == "" || len(req.providerConfigFingerprint) != 64 ||
			len(req.dispatchID) != 32 {
			return provider.ImageResult{}, errImageAuditUnconfirmed
		}
		audit := domain.GenerationAudit{
			Source: req.Source, Operation: req.Operation, TemplateVersion: editorTemplateVersion,
			Provider: providerName, Model: model, Status: "started",
			AgentRunID: req.AgentRunID, WorkflowRunID: req.WorkflowRunID,
			MediaCandidateID: req.MediaCandidateID, GenerationAttempt: req.GenerationAttempt,
			ProviderProfileID: req.providerProfileID, ProviderVendor: req.providerVendor,
			ProviderConfigFingerprint: req.providerConfigFingerprint, DispatchID: req.dispatchID,
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

// confirmImageObjectLocator persists the exact planned object location before
// Put. A write/ACK failure stops before object storage is mutated; the provider
// request is never replayed to compensate for this local evidence failure.
func (s *GenerationService) confirmImageObjectLocator(ctx context.Context, req ImageGenerationRequest) error {
	if req.GenerationAttempt == nil {
		return nil
	}
	if s == nil || s.repo == nil || req.auditID <= 0 || strings.TrimSpace(req.storageName) == "" || strings.TrimSpace(req.storageURL) == "" {
		return errImageObjectEvidenceUnconfirmed
	}
	audit := domain.GenerationAudit{
		ID: req.auditID, Source: req.Source, Operation: req.Operation, Status: "started",
		MediaCandidateID: req.MediaCandidateID, GenerationAttempt: req.GenerationAttempt,
		StorageName: req.storageName, StorageURL: req.storageURL,
	}
	auditCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	err := s.repo.RecordGenerationAudit(auditCtx, &audit)
	cancel()
	if err != nil {
		return errImageObjectEvidenceUnconfirmed
	}
	return nil
}
