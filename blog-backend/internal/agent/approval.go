package agent

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
)

var (
	ErrApprovalConflict = errors.New("approval target changed or is no longer pending")
	ErrApprovalExpired  = errors.New("approval has expired")
)

type ApprovalService struct {
	repo       *repository.AgentRepository
	posts      *service.PostService
	management *ManagementService
	growth     *service.GrowthService
	mediaDir   string
}

func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService, management *ManagementService, growth *service.GrowthService, mediaDir string) *ApprovalService {
	return &ApprovalService{repo: repo, posts: posts, management: management, growth: growth, mediaDir: mediaDir}
}

func (s *ApprovalService) List(ctx context.Context, status string, page, pageSize int) ([]*domain.AgentApproval, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return s.repo.ListApprovals(ctx, status, pageSize, (page-1)*pageSize)
}

func (s *ApprovalService) ListMediaCandidates(ctx context.Context) ([]*domain.MediaCandidate, error) {
	return s.repo.ListMediaCandidates(ctx)
}
func (s *ApprovalService) ListMediaCandidatesByWorkflowRun(ctx context.Context, runID int64) ([]*domain.MediaCandidate, error) {
	return s.repo.ListMediaCandidatesByWorkflowRun(ctx, runID)
}

func (s *ApprovalService) GetInteraction(ctx context.Context, id int64) (*domain.WorkflowInteractionTask, error) {
	return s.repo.GetInteraction(ctx, id)
}
func (s *ApprovalService) ListInteractions(ctx context.Context, runID int64) ([]*domain.WorkflowInteractionTask, error) {
	return s.repo.ListInteractions(ctx, runID)
}
func (s *ApprovalService) ListPendingInteractions(ctx context.Context) ([]*domain.WorkflowInteractionTask, error) {
	return s.repo.ListPendingInteractions(ctx)
}
func (s *ApprovalService) ResolveInteraction(ctx context.Context, id int64, token string, response json.RawMessage, subject string) (*domain.WorkflowInteractionTask, error) {
	return s.repo.ResolveInteraction(ctx, id, token, response, subject)
}
func (s *ApprovalService) CancelInteraction(ctx context.Context, id int64, token, subject string) error {
	return s.repo.CancelInteraction(ctx, id, token, subject)
}
func (s *ApprovalService) ListMediaCandidateEvents(ctx context.Context, id int64) ([]*domain.WorkflowRunEvent, error) {
	return s.repo.ListMediaCandidateEvents(ctx, id)
}
func (s *ApprovalService) ListWorkflowRunEvents(ctx context.Context, id int64) ([]*domain.WorkflowRunEvent, error) {
	return s.repo.ListWorkflowRunEvents(ctx, id)
}

func (s *ApprovalService) SelectMediaCandidate(ctx context.Context, id int64, placement, anchor string) error {
	if placement != "cover" && placement != "inline" {
		return errors.New("invalid image placement")
	}
	if placement == "inline" && strings.TrimSpace(anchor) == "" {
		return errors.New("inline image requires an anchor")
	}
	if err := s.repo.SelectMediaCandidate(ctx, id, placement, strings.TrimSpace(anchor)); err != nil {
		return err
	}
	s.appendCandidateEvent(ctx, id, "candidate_selected", map[string]any{"placement": placement})
	return nil
}

func (s *ApprovalService) SelectMediaCandidates(ctx context.Context, runID int64, selections []domain.MediaCandidateSelection) error {
	if runID <= 0 || len(selections) == 0 {
		return errors.New("at least one image candidate is required")
	}
	available, err := s.repo.ListMediaCandidatesByWorkflowRun(ctx, runID)
	if err != nil {
		return err
	}
	if err := validateMediaCandidateSelections(available, selections); err != nil {
		return err
	}
	if err := s.repo.SelectMediaCandidates(ctx, selections); err != nil {
		return err
	}
	for _, selection := range selections {
		s.appendCandidateEvent(ctx, selection.ID, "candidate_selected", map[string]any{"placement": selection.Placement, "batch": true})
	}
	return nil
}

func validateMediaCandidateSelections(available []*domain.MediaCandidate, selections []domain.MediaCandidateSelection) error {
	byID := make(map[int64]*domain.MediaCandidate, len(available))
	for _, candidate := range available {
		byID[candidate.ID] = candidate
	}
	seen := make(map[int64]bool, len(selections))
	for i := range selections {
		selection := &selections[i]
		if seen[selection.ID] {
			return errors.New("duplicate image candidate")
		}
		seen[selection.ID] = true
		candidate, ok := byID[selection.ID]
		if !ok || candidate.GenerationStatus != "generated" || candidate.MediaAssetID == nil {
			return errors.New("image candidate is not ready or does not belong to this run")
		}
		if selection.Placement == "" {
			selection.Placement = "cover"
		}
		if selection.Placement != "cover" && selection.Placement != "inline" {
			return errors.New("invalid image placement")
		}
		if selection.Placement == "inline" && strings.TrimSpace(selection.Anchor) == "" {
			return errors.New("inline image requires an anchor")
		}
	}
	return nil
}

func (s *ApprovalService) CancelMediaGeneration(ctx context.Context, id int64) error {
	if err := s.repo.CancelMediaGeneration(ctx, id); err != nil {
		return err
	}
	s.appendCandidateEvent(ctx, id, "image_generation_cancelled", map[string]any{})
	return nil
}

func (s *ApprovalService) ApplyMediaCandidate(ctx context.Context, id int64) (*domain.Post, error) {
	candidate, err := s.repo.GetMediaCandidate(ctx, id)
	if err != nil {
		return nil, err
	}
	if !candidate.Selected || candidate.MediaAssetID == nil || candidate.GenerationStatus != "generated" {
		return nil, errors.New("image candidate is not ready to apply")
	}
	post, err := s.posts.GetByID(ctx, candidate.PostID)
	if err != nil || post == nil {
		return nil, service.ErrPostNotFound
	}
	if expected, parseErr := strconv.ParseInt(candidate.PostVersionToken, 10, 64); parseErr == nil && expected != post.UpdatedAt.Unix() {
		s.appendCandidateEvent(ctx, id, "article_apply_conflict", map[string]any{"reason": "version_token"})
		return nil, fmt.Errorf("article version conflict")
	}
	assets, err := s.growth.ListMedia(ctx)
	if err != nil {
		return nil, err
	}
	var asset *domain.MediaAsset
	for _, item := range assets {
		if item.ID == *candidate.MediaAssetID {
			asset = item
			break
		}
	}
	if asset == nil {
		return nil, errors.New("media asset not found")
	}
	if candidate.Placement == "inline" {
		if candidate.Anchor == "" || !strings.Contains(post.Content, candidate.Anchor) {
			s.appendCandidateEvent(ctx, id, "article_apply_conflict", map[string]any{"reason": "anchor"})
			return nil, fmt.Errorf("article anchor conflict")
		}
		post.Content = strings.Replace(post.Content, candidate.Anchor, candidate.Anchor+"\n\n!["+candidate.AltText+"]("+asset.URL+")", 1)
	} else {
		post.CoverURL, post.CoverAlt = asset.URL, candidate.AltText
	}
	s.appendCandidateEvent(ctx, id, "article_apply_confirmed", map[string]any{"post_id": post.ID, "placement": candidate.Placement})
	if err := s.posts.UpdatePost(ctx, post); err != nil {
		return nil, err
	}
	versions, _ := s.growth.ListVersions(ctx, post.ID)
	if len(versions) > 0 {
		_ = s.repo.MarkMediaCandidateApplied(ctx, id, versions[0].ID)
	}
	s.appendCandidateEvent(ctx, id, "article_version_created", map[string]any{"post_id": post.ID, "placement": candidate.Placement})
	return post, nil
}

// ApplyMediaCandidates merges all selected images for one run into a single
// post update. This preserves the article's version history and makes a
// multi-image workflow atomic from the editor's point of view.
func (s *ApprovalService) ApplyMediaCandidates(ctx context.Context, runID int64, ids []int64) (*domain.Post, error) {
	if runID <= 0 || len(ids) == 0 {
		return nil, errors.New("at least one selected image is required")
	}
	candidates, err := s.repo.ListMediaCandidatesByWorkflowRun(ctx, runID)
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]*domain.MediaCandidate, len(candidates))
	for _, candidate := range candidates {
		byID[candidate.ID] = candidate
	}
	seen := make(map[int64]bool, len(ids))
	var postID int64
	var cover *domain.MediaCandidate
	for _, id := range ids {
		if seen[id] {
			return nil, errors.New("duplicate image candidate")
		}
		seen[id] = true
		candidate, ok := byID[id]
		if !ok || !candidate.Selected || candidate.MediaAssetID == nil || candidate.GenerationStatus != "generated" {
			return nil, errors.New("image candidate is not selected, ready, or owned by this run")
		}
		if postID == 0 {
			postID = candidate.PostID
		} else if postID != candidate.PostID {
			return nil, errors.New("image candidates must target the same article")
		}
		if candidate.Placement == "cover" {
			if cover != nil {
				return nil, errors.New("only one cover image may be applied")
			}
			cover = candidate
		}
		if candidate.Placement == "inline" && strings.TrimSpace(candidate.Anchor) == "" {
			return nil, errors.New("inline image requires an anchor")
		}
	}
	post, err := s.posts.GetByID(ctx, postID)
	if err != nil || post == nil {
		return nil, service.ErrPostNotFound
	}
	for _, id := range ids {
		candidate := byID[id]
		if expected, parseErr := strconv.ParseInt(candidate.PostVersionToken, 10, 64); parseErr == nil && expected != post.UpdatedAt.Unix() {
			s.appendCandidateEvent(ctx, id, "article_apply_conflict", map[string]any{"reason": "version_token", "batch": true})
			return nil, fmt.Errorf("article version conflict")
		}
	}
	assets, err := s.growth.ListMedia(ctx)
	if err != nil {
		return nil, err
	}
	assetByID := make(map[int64]*domain.MediaAsset, len(assets))
	for _, asset := range assets {
		assetByID[asset.ID] = asset
	}
	for _, id := range ids {
		candidate := byID[id]
		asset := assetByID[*candidate.MediaAssetID]
		if asset == nil {
			return nil, errors.New("media asset not found")
		}
		if candidate.Placement == "inline" {
			if !strings.Contains(post.Content, candidate.Anchor) {
				s.appendCandidateEvent(ctx, id, "article_apply_conflict", map[string]any{"reason": "anchor", "batch": true})
				return nil, fmt.Errorf("article anchor conflict")
			}
			post.Content = strings.Replace(post.Content, candidate.Anchor, candidate.Anchor+"\n\n!["+candidate.AltText+"]("+asset.URL+")", 1)
		} else {
			post.CoverURL, post.CoverAlt = asset.URL, candidate.AltText
		}
	}
	if err := s.posts.UpdatePost(ctx, post); err != nil {
		return nil, err
	}
	versions, _ := s.growth.ListVersions(ctx, post.ID)
	var versionID int64
	if len(versions) > 0 {
		versionID = versions[0].ID
	}
	for _, id := range ids {
		if versionID > 0 {
			_ = s.repo.MarkMediaCandidateApplied(ctx, id, versionID)
		}
		s.appendCandidateEvent(ctx, id, "article_apply_confirmed", map[string]any{"post_id": post.ID, "batch": true})
		s.appendCandidateEvent(ctx, id, "article_version_created", map[string]any{"post_id": post.ID, "batch": true})
	}
	return post, nil
}

func (s *ApprovalService) PreviewMediaCandidate(ctx context.Context, id int64) (map[string]any, error) {
	candidate, err := s.repo.GetMediaCandidate(ctx, id)
	if err != nil {
		return nil, err
	}
	if candidate.MediaAssetID == nil || candidate.GenerationStatus != "generated" {
		return nil, errors.New("image candidate is not ready to preview")
	}
	post, err := s.posts.GetByID(ctx, candidate.PostID)
	if err != nil {
		return nil, err
	}
	assets, err := s.growth.ListMedia(ctx)
	if err != nil {
		return nil, err
	}
	var asset *domain.MediaAsset
	for _, item := range assets {
		if item.ID == *candidate.MediaAssetID {
			asset = item
			break
		}
	}
	if asset == nil {
		return nil, errors.New("media asset not found")
	}
	versionMatches := true
	if expected, parseErr := strconv.ParseInt(candidate.PostVersionToken, 10, 64); parseErr == nil {
		versionMatches = expected == post.UpdatedAt.Unix()
	}
	anchorMatches := candidate.Placement != "inline" || (candidate.Anchor != "" && strings.Contains(post.Content, candidate.Anchor))
	preview := map[string]any{"post_id": post.ID, "title": post.Title, "placement": candidate.Placement, "image_url": asset.URL, "alt_text": candidate.AltText, "version_matches": versionMatches, "anchor_matches": anchorMatches, "cover_url": post.CoverURL, "content": post.Content}
	if candidate.Placement == "inline" && anchorMatches {
		preview["content"] = strings.Replace(post.Content, candidate.Anchor, candidate.Anchor+"\n\n!["+candidate.AltText+"]("+asset.URL+")", 1)
	}
	if candidate.Placement == "cover" {
		preview["cover_url"] = asset.URL
		preview["cover_alt"] = candidate.AltText
	}
	s.appendCandidateEvent(ctx, id, "article_preview_created", map[string]any{"post_id": post.ID, "placement": candidate.Placement, "version_matches": versionMatches, "anchor_matches": anchorMatches})
	return preview, nil
}

func (s *ApprovalService) appendCandidateEvent(ctx context.Context, candidateID int64, eventType string, payload map[string]any) {
	candidate, err := s.repo.GetMediaCandidate(ctx, candidateID)
	if err != nil || candidate.WorkflowRunID == nil {
		return
	}
	runID := *candidate.WorkflowRunID
	raw, _ := json.Marshal(payload)
	_ = s.repo.AppendWorkflowRunEvent(ctx, &domain.WorkflowRunEvent{WorkflowRunID: &runID, WorkflowStepID: candidate.WorkflowStepID, InteractionTaskID: candidate.InteractionTaskID, EventType: eventType, Payload: raw})
}

func (s *ApprovalService) ReviewMediaCandidate(ctx context.Context, id int64, action, reviewer, note string) error {
	if id <= 0 || (action != "ready" && action != "reject") || (action == "reject" && strings.TrimSpace(note) == "") {
		return ErrInvalid
	}
	if err := s.repo.ReviewMediaCandidate(ctx, id, action, reviewer, strings.TrimSpace(note)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrApprovalConflict
		}
		return err
	}
	return nil
}

func (s *ApprovalService) AttachMediaAsset(ctx context.Context, candidateID, mediaAssetID int64) error {
	if candidateID <= 0 || mediaAssetID <= 0 {
		return ErrInvalid
	}
	if err := s.repo.AttachMediaAsset(ctx, candidateID, mediaAssetID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrApprovalConflict
		}
		return err
	}
	return nil
}

func (s *ApprovalService) GenerateMediaCandidate(ctx context.Context, id int64, creator string) error {
	if id <= 0 || s.management == nil || s.growth == nil || s.mediaDir == "" {
		return ErrInvalid
	}
	candidate, err := s.repo.ClaimMediaGeneration(ctx, id)
	if err != nil {
		return ErrApprovalConflict
	}
	if candidate.GenerationAttempt > 1 {
		s.appendCandidateEvent(ctx, id, "regeneration_requested", map[string]any{"attempt": candidate.GenerationAttempt})
	}
	s.appendCandidateEvent(ctx, id, "image_generation_started", map[string]any{"attempt": candidate.GenerationAttempt})
	generationCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	fail := func(code, reason string) error {
		_ = s.repo.RecordMediaGenerationError(ctx, id, code, reason)
		return errors.New(reason)
	}
	profiles, err := s.management.ListProviders(generationCtx)
	if err != nil {
		return fail("image_generation_failed", err.Error())
	}
	var profileID int64
	for _, item := range profiles {
		if item.IsDefaultImage && item.Enabled {
			profileID = item.ID
			break
		}
	}
	if profileID == 0 {
		return fail("image_generation_failed", "no enabled default image provider")
	}
	client, err := s.management.ProviderClient(generationCtx, profileID)
	if err != nil {
		return fail("image_generation_failed", err.Error())
	}
	generator, ok := client.(provider.ImageGenerator)
	if !ok {
		return fail("image_generation_failed", "provider does not support image generation")
	}
	prompt := candidate.Brief
	if candidate.RegenerationInstruction != "" {
		prompt += "\n\nAdditional editor requirements for this generation:\n" + candidate.RegenerationInstruction
	}
	image, err := generator.GenerateImage(generationCtx, provider.ImageRequest{Prompt: prompt})
	if err != nil || len(image.Data) == 0 || len(image.Data) > 10<<20 || (image.MIMEType != "image/jpeg" && image.MIMEType != "image/png" && image.MIMEType != "image/webp") {
		if errors.Is(generationCtx.Err(), context.DeadlineExceeded) {
			return fail("image_generation_timeout", "image generation timed out")
		}
		return fail("image_generation_failed", "provider returned an invalid image")
	}
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[image.MIMEType]
	if err := os.MkdirAll(s.mediaDir, 0o755); err != nil {
		return fail("image_generation_failed", err.Error())
	}
	nameBytes := make([]byte, 16)
	if _, err := rand.Read(nameBytes); err != nil {
		return fail("image_generation_failed", err.Error())
	}
	storageName := fmt.Sprintf("ai-%x%s", nameBytes, ext)
	path := filepath.Join(s.mediaDir, storageName)
	if err := os.WriteFile(path, image.Data, 0o644); err != nil {
		return fail("image_generation_failed", err.Error())
	}
	asset := &domain.MediaAsset{Filename: "ai-" + fmt.Sprint(candidate.ID) + ext, StorageName: storageName, URL: "/media/" + storageName, ContentType: image.MIMEType, SizeBytes: int64(len(image.Data)), AltText: candidate.AltText}
	if creator != "" {
		asset.CreatedBy = &creator
	}
	if err := s.growth.CreateMedia(ctx, asset); err != nil {
		_ = os.Remove(path)
		return fail("image_generation_failed", err.Error())
	}
	if err := s.repo.CompleteMediaGeneration(ctx, id, asset.ID, false); err != nil {
		_, _ = s.growth.DeleteMedia(ctx, asset.ID)
		_ = os.Remove(path)
		return err
	}
	s.appendCandidateEvent(ctx, id, "image_generation_completed", map[string]any{"media_asset_id": asset.ID})
	return nil
}

func (s *ApprovalService) SetMediaGenerationInstruction(ctx context.Context, id int64, instruction string) error {
	instruction = strings.TrimSpace(instruction)
	if id <= 0 || len([]rune(instruction)) > 2000 {
		return ErrInvalid
	}
	if err := s.repo.SetMediaGenerationInstruction(ctx, id, instruction); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrApprovalConflict
		}
		return err
	}
	if instruction != "" {
		s.appendCandidateEvent(ctx, id, "regeneration_requested", map[string]any{"instruction": instruction})
	}
	return nil
}

func (s *ApprovalService) Reject(ctx context.Context, id int64, reviewer, note string) error {
	if err := s.repo.RejectApproval(ctx, id, reviewer, strings.TrimSpace(note)); err != nil {
		return ErrApprovalConflict
	}
	return nil
}

func (s *ApprovalService) Approve(ctx context.Context, id int64, reviewer, note string) error {
	approval, err := s.repo.GetApproval(ctx, id)
	if err != nil {
		return translateError(err)
	}
	if approval.Status != domain.ApprovalPending {
		return ErrApprovalConflict
	}
	if time.Now().After(approval.ExpiresAt) {
		_ = s.repo.CompleteApproval(ctx, id, domain.ApprovalExpired, "approval expired")
		return ErrApprovalExpired
	}
	if err := s.validateConflict(ctx, approval); err != nil {
		return err
	}
	if err := s.repo.ClaimApproval(ctx, id, reviewer, strings.TrimSpace(note)); err != nil {
		return ErrApprovalConflict
	}
	if err := s.execute(ctx, approval); err != nil {
		_ = s.repo.CompleteApproval(ctx, id, domain.ApprovalFailed, safeError(err))
		return err
	}
	return s.repo.CompleteApproval(ctx, id, domain.ApprovalExecuted, "")
}

// StartImageGenerationForApprovedBrief bridges the approved image brief to the
// run-owned image task. It intentionally runs after approval is committed so a
// retry can never create a second candidate or bypass the existing approval.
func (s *ApprovalService) StartImageGenerationForApprovedBrief(ctx context.Context, approvalID int64, creator string) error {
	approval, err := s.repo.GetApproval(ctx, approvalID)
	if err != nil {
		return translateError(err)
	}
	if approval.Status != domain.ApprovalExecuted || !isImageBriefApproval(approval) {
		return nil
	}
	candidates, err := s.repo.ListMediaCandidates(ctx)
	if err != nil {
		return err
	}
	for _, candidate := range candidates {
		if candidate.SourceApprovalID != approval.ID {
			continue
		}
		s.appendCandidateEvent(ctx, candidate.ID, "image_candidates_created", map[string]any{"candidate_id": candidate.ID, "post_id": candidate.PostID})
		return s.GenerateMediaCandidate(ctx, candidate.ID, creator)
	}
	return ErrApprovalConflict
}

func isImageBriefApproval(approval *domain.AgentApproval) bool {
	if approval == nil || (approval.ActionType != "create_media_candidate" && approval.ActionType != "create_distribution_draft") {
		return false
	}
	var payload struct {
		Format string `json:"format"`
	}
	return json.Unmarshal(approval.ProposedPayload, &payload) == nil && payload.Format == "image_brief"
}

func (s *ApprovalService) validateConflict(ctx context.Context, approval *domain.AgentApproval) error {
	// Only approvals that write an existing post need optimistic-concurrency
	// protection. Preparatory approvals (candidate sets and image briefs) do
	// not mutate the post, and must remain usable after a separate edit.
	if !approvalMutatesExistingPost(approval.ActionType) {
		return nil
	}
	if approval.TargetType != "post" || approval.TargetID == nil || len(approval.BeforeSnapshot) == 0 {
		return nil
	}
	var before domain.Post
	if err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil {
		return ErrApprovalConflict
	}
	current, err := s.posts.GetAdminPost(ctx, *approval.TargetID)
	if err != nil || !current.UpdatedAt.Equal(before.UpdatedAt) {
		return ErrApprovalConflict
	}
	return nil
}

func approvalMutatesExistingPost(actionType string) bool {
	return actionType == "update_post" || actionType == "update_tags"
}

func (s *ApprovalService) execute(ctx context.Context, approval *domain.AgentApproval) error {
	switch approval.ActionType {
	case "create_draft":
		var payload struct {
			Title   string   `json:"title"`
			Slug    string   `json:"slug"`
			Summary string   `json:"summary"`
			Content string   `json:"content"`
			Tags    []string `json:"tags"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		return s.posts.CreatePost(ctx, &domain.Post{
			Title: payload.Title, Slug: payload.Slug, Summary: payload.Summary,
			Content: payload.Content, Tags: payload.Tags, Status: domain.PostStatusDraft,
		})
	case "update_post", "update_tags":
		if approval.TargetID == nil {
			return errors.New("post target is required")
		}
		current, err := s.posts.GetAdminPost(ctx, *approval.TargetID)
		if err != nil {
			return err
		}
		var payload struct {
			Title    *string   `json:"title"`
			Slug     *string   `json:"slug"`
			Summary  *string   `json:"summary"`
			Content  *string   `json:"content"`
			Tags     *[]string `json:"tags"`
			CoverAlt *string   `json:"cover_alt"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.Title != nil {
			current.Title = *payload.Title
		}
		if payload.Slug != nil {
			current.Slug = *payload.Slug
		}
		if payload.Summary != nil {
			current.Summary = *payload.Summary
		}
		if payload.Content != nil {
			current.Content = *payload.Content
		}
		if payload.Tags != nil {
			current.Tags = *payload.Tags
		}
		if payload.CoverAlt != nil {
			current.CoverAlt = *payload.CoverAlt
		}
		return s.posts.UpdatePost(ctx, current)
	case "reply_comment":
		var payload struct {
			CommentID int64  `json:"comment_id"`
			Content   string `json:"content"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.CommentID <= 0 || strings.TrimSpace(payload.Content) == "" {
			return errors.New("invalid reply draft")
		}
		return s.repo.CreateReplyDraft(ctx, approval.ID, payload.CommentID, payload.Content)
	case "create_editorial_task":
		var payload struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Priority    string `json:"priority"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.Priority == "" {
			payload.Priority = "medium"
		}
		return s.repo.CreateEditorialTask(ctx, approval.ID, payload.Title, payload.Description, payload.Priority)
	case "create_operational_suggestion":
		var payload domain.OperationalSuggestion
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		payload.SourceRunID = &approval.RunID
		return s.repo.CreateOperationalSuggestion(ctx, &payload)
	case "create_content_candidates":
		if err := s.repo.CreateContentCandidateSet(ctx, approval); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		return nil
	case "create_media_candidate":
		if err := s.repo.CreateMediaCandidate(ctx, approval); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		return nil
	case "create_distribution_draft":
		// The approved payload remains in ai_approvals as the audited, copyable
		// draft. Do not add external delivery here: every connector requires its
		// own credentials, idempotency controls, and a separate publish approval.
		var payload struct {
			PostID int64  `json:"post_id"`
			Format string `json:"format"`
			Body   string `json:"body"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.PostID <= 0 || strings.TrimSpace(payload.Body) == "" {
			return errors.New("invalid distribution draft")
		}
		switch payload.Format {
		case "social", "newsletter", "faq", "image_brief":
			if payload.Format == "image_brief" {
				if err := s.repo.CreateMediaCandidate(ctx, approval); err != nil {
					return fmt.Errorf("%w: %v", ErrInvalid, err)
				}
				return nil
			}
			return nil
		default:
			return errors.New("invalid distribution draft format")
		}
	default:
		return fmt.Errorf("unsupported approval action %q", approval.ActionType)
	}
}
