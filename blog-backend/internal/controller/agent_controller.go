package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
	"github.com/rushairer/gouno"
)

type AgentController struct {
	svc       *agentservice.ManagementService
	runner    *agentservice.Runner
	approvals *agentservice.ApprovalService
	tools     *tool.Registry
	workerCtx context.Context
}

func NewAgentController(svc *agentservice.ManagementService, runner *agentservice.Runner, approvals *agentservice.ApprovalService, tools *tool.Registry, workerCtx context.Context) *AgentController {
	return &AgentController{svc: svc, runner: runner, approvals: approvals, tools: tools, workerCtx: workerCtx}
}

type providerRequest struct {
	Name                  string              `json:"name" binding:"required"`
	ProviderType          domain.ProviderType `json:"provider_type" binding:"required"`
	BaseURL               string              `json:"base_url" binding:"required"`
	Model                 string              `json:"model" binding:"required"`
	APIKey                string              `json:"api_key"`
	Enabled               bool                `json:"enabled"`
	RequestTimeoutSeconds int                 `json:"request_timeout_seconds"`
	MaxOutputTokens       int                 `json:"max_output_tokens"`
}

func (ctrl *AgentController) ListProviders(c *gin.Context) {
	items, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) CreateProvider(c *gin.Context) {
	ctrl.saveProvider(c, 0)
}

func (ctrl *AgentController) UpdateProvider(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	ctrl.saveProvider(c, id)
}

func (ctrl *AgentController) saveProvider(c *gin.Context, id int64) {
	var req providerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	profile := &domain.ProviderProfile{
		ID: id, Name: req.Name, ProviderType: req.ProviderType, BaseURL: req.BaseURL,
		Model: req.Model, Enabled: req.Enabled, RequestTimeoutSeconds: req.RequestTimeoutSeconds,
		MaxOutputTokens: req.MaxOutputTokens,
	}
	if err := ctrl.svc.SaveProvider(c.Request.Context(), profile, req.APIKey); err != nil {
		writeAgentError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(profile))
}

func (ctrl *AgentController) DeleteProvider(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteProvider(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) TestProvider(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	duration, err := ctrl.svc.TestProvider(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"ok": true, "latency_ms": duration.Milliseconds()}))
}

func (ctrl *AgentController) ListAgents(c *gin.Context) {
	items, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) GetAgent(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	item, err := ctrl.svc.GetAgent(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) CreateAgent(c *gin.Context) {
	ctrl.saveAgent(c, 0)
}

func (ctrl *AgentController) UpdateAgent(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	ctrl.saveAgent(c, id)
}

func (ctrl *AgentController) saveAgent(c *gin.Context, id int64) {
	var value domain.Agent
	if err := c.ShouldBindJSON(&value); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	value.ID = id
	if id == 0 {
		if subject, exists := c.Get("account_id"); exists {
			if text, ok := subject.(string); ok && text != "" {
				value.CreatedBy = &text
			}
		}
	}
	if err := ctrl.svc.SaveAgent(c.Request.Context(), &value); err != nil {
		writeAgentError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *AgentController) DeleteAgent(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteAgent(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) SetAgentEnabled(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	enabled := c.Param("action") == "enable"
	if err := ctrl.svc.SetAgentEnabled(c.Request.Context(), id, enabled); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *AgentController) EnableAgent(c *gin.Context) {
	ctrl.setEnabled(c, true)
}

func (ctrl *AgentController) DisableAgent(c *gin.Context) {
	ctrl.setEnabled(c, false)
}

func (ctrl *AgentController) setEnabled(c *gin.Context, enabled bool) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.svc.SetAgentEnabled(c.Request.Context(), id, enabled); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *AgentController) RunAgent(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var input json.RawMessage
	if c.Request.ContentLength > 0 {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
		var request struct {
			Input json.RawMessage `json:"input"`
		}
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		input = request.Input
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	var subject *string
	if value, exists := c.Get("account_id"); exists {
		if text, ok := value.(string); ok && text != "" {
			subject = &text
		}
	}
	run, err := ctrl.runner.Queue(c.Request.Context(), id, domain.AgentTriggerManual, subject, input, nil)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	go ctrl.runner.Execute(ctrl.workerCtx, run.ID)
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *AgentController) ListRuns(c *gin.Context) {
	agentIDValue, _ := strconv.ParseInt(c.Query("agent_id"), 10, 64)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	items, total, err := ctrl.runner.ListRuns(c.Request.Context(), agentIDValue, page, pageSize)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list": items, "total": total, "page": page, "pageSize": pageSize,
	}))
}

func (ctrl *AgentController) GetRun(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	run, err := ctrl.runner.GetRun(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	calls, err := ctrl.runner.ListToolCalls(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"run": run, "tool_calls": calls}))
}

func (ctrl *AgentController) ToolCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(ctrl.tools.Catalog()))
}

func (ctrl *AgentController) Presets(c *gin.Context) {
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(agentservice.Presets()))
}

func (ctrl *AgentController) ListApprovals(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	items, total, err := ctrl.approvals.List(c.Request.Context(), c.DefaultQuery("status", "pending"), page, pageSize)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list": items, "total": total, "page": page, "pageSize": pageSize,
	}))
}

type approvalReviewRequest struct {
	Note string `json:"note"`
}

func (ctrl *AgentController) Approve(c *gin.Context) {
	ctrl.reviewApproval(c, true)
}

func (ctrl *AgentController) Reject(c *gin.Context) {
	ctrl.reviewApproval(c, false)
}

func (ctrl *AgentController) reviewApproval(c *gin.Context, approve bool) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req approvalReviewRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
	}
	reviewer, _ := c.Get("account_id")
	reviewerText, _ := reviewer.(string)
	var err error
	if approve {
		err = ctrl.approvals.Approve(c.Request.Context(), id, reviewerText, req.Note)
	} else {
		err = ctrl.approvals.Reject(c.Request.Context(), id, reviewerText, req.Note)
	}
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func agentID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid id"))
		return 0, false
	}
	return id, true
}

func writeAgentError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, agentservice.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, agentservice.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, agentservice.ErrConflict), errors.Is(err, agentservice.ErrProviderInUse):
		status = http.StatusConflict
	case errors.Is(err, agentservice.ErrAlreadyRunning), errors.Is(err, agentservice.ErrRunLimit),
		errors.Is(err, agentservice.ErrTokenBudget), errors.Is(err, agentservice.ErrApprovalConflict),
		errors.Is(err, agentservice.ErrApprovalExpired):
		status = http.StatusConflict
	}
	c.JSON(status, gouno.NewErrorResponse(status, err.Error()))
}
