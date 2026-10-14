package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/gouno"
)

func (ctrl *Controller) ListMediaCandidates(c *gin.Context) {
	items, err := ctrl.approvals.ListMediaCandidates(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

// ListMediaGenerationReconciliation exposes read-only, bounded evidence for
// an authenticated AI-Operations administrator. A deadline is an investigation
// signal and MUST NOT reset a lease, retry a model, or imply the provider quit.
func (ctrl *Controller) ListMediaGenerationReconciliation(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil || limit < 1 || limit > 100 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "limit must be an integer between 1 and 100"))
		return
	}
	items, err := ctrl.approvals.ListMediaGenerationReconciliation(c.Request.Context(), limit)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

// ReleaseUncertainImageTask records an independently reviewed resolution,
// never retries the Provider itself. Router middleware additionally requires
// ManageSite permission on top of AI Manage + AAL2 + recent MFA. An evidence
// reference is an opaque ticket identifier, not raw provider/account secrets.
func (ctrl *Controller) ReleaseUncertainImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		ExpectedGenerationAttempt int    `json:"expected_generation_attempt" binding:"required,min=1"`
		EvidenceReference         string `json:"evidence_reference" binding:"required"`
		VerifiedProviderOutcome   bool   `json:"verified_provider_outcome" binding:"required"`
		VerifiedObjectStorage     bool   `json:"verified_object_storage" binding:"required"`
		AcknowledgedPossibleBilling bool `json:"acknowledged_possible_billing" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid manual recovery evidence"))
		return
	}
	reviewerID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	decision := domain.MediaGenerationRecoveryDecision{
		CandidateID: id, GenerationAttempt: req.ExpectedGenerationAttempt,
		ReviewerPrincipalID: reviewerID, EvidenceReference: strings.TrimSpace(req.EvidenceReference),
		VerifiedProviderOutcome: req.VerifiedProviderOutcome,
		VerifiedObjectStorage: req.VerifiedObjectStorage,
		AcknowledgedPossibleBilling: req.AcknowledgedPossibleBilling,
	}
	if err := ctrl.approvals.ReleaseMediaGenerationAfterVerifiedReview(c.Request.Context(), decision); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ReviewMediaCandidate(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Action string `json:"action" binding:"required"`
		Note   string `json:"note"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	reviewerPrincipalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	if err := ctrl.approvals.ReviewMediaCandidate(c.Request.Context(), id, req.Action, reviewerPrincipalID, req.Note); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) reconcileCandidateWorkflow(c *gin.Context, candidateID int64) {
	candidate, err := ctrl.approvals.GetMediaCandidate(c.Request.Context(), candidateID)
	if err != nil || candidate.WorkflowRunID == nil {
		return
	}
	_ = ctrl.workflows.ReconcileMediaRun(c.Request.Context(), *candidate.WorkflowRunID)
}

func (ctrl *Controller) AttachMediaAsset(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		MediaAssetID int64 `json:"media_asset_id" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	if err := ctrl.approvals.AttachMediaAsset(c.Request.Context(), id, req.MediaAssetID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) GenerateMediaCandidate(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Instruction string `json:"instruction"`
	}
	if c.Request.ContentLength > 0 {
		if err := bindAgentJSON(c, &req); err != nil {
			controllerutil.WriteJSONBindingError(c, err, "")
			return
		}
		if err := ctrl.approvals.SetMediaGenerationInstruction(c.Request.Context(), id, req.Instruction); err != nil {
			controllerutil.WriteDomainError(c, err)
			return
		}
	}
	creatorPrincipalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	go func() {
		_ = ctrl.approvals.GenerateMediaCandidate(ctrl.workerCtx, id, creatorPrincipalID)
	}()
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) RegenerateImageTask(c *gin.Context) {
	ctrl.GenerateMediaCandidate(c)
}

func (ctrl *Controller) CancelImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.approvals.CancelMediaGeneration(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) SelectImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Placement string `json:"placement"`
		Anchor    string `json:"anchor"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	if err := ctrl.approvals.SelectMediaCandidate(c.Request.Context(), id, req.Placement, req.Anchor); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) SelectWorkflowImageTasks(c *gin.Context) {
	runID, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Selections []domain.MediaCandidateSelection `json:"selections" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	if err := ctrl.approvals.SelectMediaCandidates(c.Request.Context(), runID, req.Selections); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ApplyWorkflowImageTasks(c *gin.Context) {
	runID, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		CandidateIDs []int64 `json:"candidate_ids" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	post, err := ctrl.approvals.ApplyMediaCandidates(c.Request.Context(), runID, req.CandidateIDs)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *Controller) RejectWorkflowImageTasks(c *gin.Context) {
	runID, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		CandidateIDs []int64 `json:"candidate_ids" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	if err := ctrl.approvals.RejectMediaCandidates(c.Request.Context(), runID, req.CandidateIDs); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) RejectImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.approvals.RejectMediaCandidate(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ApplyImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	post, err := ctrl.approvals.ApplyMediaCandidate(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *Controller) PreviewImageTask(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	preview, err := ctrl.approvals.PreviewMediaCandidate(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(preview))
}

func (ctrl *Controller) ImageTaskEvents(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.approvals.ListMediaCandidateEvents(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) GenerateImage(c *gin.Context) {
	var req struct {
		Prompt  string `json:"prompt" binding:"required"`
		AltText string `json:"alt_text"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		controllerutil.WriteJSONBindingError(c, err, "")
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "prompt is required"))
		return
	}
	creatorPrincipalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	asset, err := ctrl.approvals.GenerateDirectImage(c.Request.Context(), prompt, req.AltText, creatorPrincipalID)
	if err != nil {
		// A provider, storage or database failure is NOT an invalid JSON
		// request. Translate only typed domain errors, redact unknown causes.
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"url":      asset.URL,
		"asset_id": asset.ID,
		"alt_text": asset.AltText,
	}))
}
