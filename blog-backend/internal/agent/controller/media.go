package controller

import (
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"url":      asset.URL,
		"asset_id": asset.ID,
		"alt_text": asset.AltText,
	}))
}
