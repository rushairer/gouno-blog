package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/operations"
	"github.com/rushairer/gouno"
)

func (ctrl *AgentController) SetOperationsService(service *operations.Service) {
	ctrl.operations = service
}

func (ctrl *AgentController) ListSuggestions(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > maxPageSize {
		limit = maxPageSize
	}
	items, err := ctrl.operations.ListSuggestions(c.Request.Context(), c.DefaultQuery("status", "new"), limit)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) RefreshSuggestions(c *gin.Context) {
	if err := ctrl.operations.RefreshSuggestions(c.Request.Context()); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) IgnoreSuggestion(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.operations.IgnoreSuggestion(c.Request.Context(), id, req.Reason); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ConvertSuggestion(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.operations.ConvertSuggestion(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ListEditorialTasks(c *gin.Context) {
	items, err := ctrl.operations.ListEditorialTasks(c.Request.Context(), c.Query("status"))
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) UpdateEditorialTaskStatus(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.operations.UpdateEditorialTaskStatus(c.Request.Context(), id, req.Status); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ListCandidateSets(c *gin.Context) {
	items, err := ctrl.operations.ListCandidateSets(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) ListMediaCandidates(c *gin.Context) {
	items, err := ctrl.approvals.ListMediaCandidates(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) ReviewMediaCandidate(c *gin.Context) {
	id, ok := agentID(c)
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
	reviewer, _ := c.Get("account_id")
	reviewerText, _ := reviewer.(string)
	if err := ctrl.approvals.ReviewMediaCandidate(c.Request.Context(), id, req.Action, reviewerText, req.Note); err != nil {
		writeAgentError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) reconcileCandidateWorkflow(c *gin.Context, candidateID int64) {
	candidate, err := ctrl.approvals.GetMediaCandidate(c.Request.Context(), candidateID)
	if err != nil || candidate.WorkflowRunID == nil {
		return
	}
	_ = ctrl.workflows.ReconcileMediaRun(c.Request.Context(), *candidate.WorkflowRunID)
}

func (ctrl *AgentController) AttachMediaAsset(c *gin.Context) {
	id, ok := agentID(c)
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
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) GenerateMediaCandidate(c *gin.Context) {
	id, ok := agentID(c)
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
			writeAgentError(c, err)
			return
		}
	}
	creator, _ := c.Get("account_id")
	creatorText, _ := creator.(string)
	go func() {
		_ = ctrl.approvals.GenerateMediaCandidate(ctrl.workerCtx, id, creatorText)
	}()
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) RegenerateImageTask(c *gin.Context) {
	ctrl.GenerateMediaCandidate(c)
}

func (ctrl *AgentController) CancelImageTask(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.approvals.CancelMediaGeneration(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) SelectImageTask(c *gin.Context) {
	id, ok := agentID(c)
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
		writeAgentError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) SelectWorkflowImageTasks(c *gin.Context) {
	runID, ok := agentID(c)
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
		writeAgentError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ApplyWorkflowImageTasks(c *gin.Context) {
	runID, ok := agentID(c)
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
		writeAgentError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *AgentController) RejectWorkflowImageTasks(c *gin.Context) {
	runID, ok := agentID(c)
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
		writeAgentError(c, err)
		return
	}
	if err := ctrl.workflows.ReconcileMediaRun(c.Request.Context(), runID); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) RejectImageTask(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.approvals.RejectMediaCandidate(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ApplyImageTask(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	post, err := ctrl.approvals.ApplyMediaCandidate(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	ctrl.reconcileCandidateWorkflow(c, id)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *AgentController) PreviewImageTask(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	preview, err := ctrl.approvals.PreviewMediaCandidate(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(preview))
}

func (ctrl *AgentController) ImageTaskEvents(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	items, err := ctrl.approvals.ListMediaCandidateEvents(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) SelectCandidate(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req struct {
		CandidateID int64 `json:"candidate_id" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.operations.SelectCandidate(c.Request.Context(), id, req.CandidateID); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) SaveFeedback(c *gin.Context) {
	var value domain.AIFeedback
	if err := bindAgentJSON(c, &value); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if subject, exists := c.Get("account_id"); exists {
		value.CreatedBy, _ = subject.(string)
	}
	if err := ctrl.operations.SaveFeedback(c.Request.Context(), &value); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(&value))
}

func (ctrl *AgentController) OutcomeMetrics(c *gin.Context) {
	result, err := ctrl.operations.OutcomeMetrics(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
