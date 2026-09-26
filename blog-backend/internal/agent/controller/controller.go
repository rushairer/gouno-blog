package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/tool"
	"github.com/rushairer/gouno"
)

type WorkflowLifecyclePort interface {
	ResumeAfterApproval(context.Context, int64) error
	Cancel(context.Context, int64) error
	ReconcileMediaRun(context.Context, int64) error
}

type Controller struct {
	svc        *agentservice.ManagementService
	runner     *agentservice.Runner
	approvals  *agentservice.ApprovalService
	tools      *tool.Registry
	workerCtx  context.Context
	workflows  WorkflowLifecyclePort
	generation *agentservice.GenerationService
}

const maxWorkflowJSONBody = 256 << 10

type Options struct {
	Management *agentservice.ManagementService
	Runner     *agentservice.Runner
	Approvals  *agentservice.ApprovalService
	Tools      *tool.Registry
	WorkerCtx  context.Context
	Workflows  WorkflowLifecyclePort
	Generation *agentservice.GenerationService
}

func New(opts Options) *Controller {
	return &Controller{
		svc:        opts.Management,
		runner:     opts.Runner,
		approvals:  opts.Approvals,
		tools:      opts.Tools,
		workerCtx:  opts.WorkerCtx,
		workflows:  opts.Workflows,
		generation: opts.Generation,
	}
}

type providerRequest struct {
	ID                    int64                       `json:"id,omitempty"`
	Name                  string                      `json:"name" binding:"required"`
	ProviderType          providerdomain.ProviderType `json:"provider_type" binding:"required"`
	Vendor                providerdomain.ProviderVendor `json:"vendor"`
	BaseURL               string                      `json:"base_url" binding:"required"`
	Model                 string                      `json:"model" binding:"required"`
	APIKey                string                      `json:"api_key"`
	Enabled               bool                        `json:"enabled"`
	ProtocolMode          string                      `json:"protocol_mode"`
	StreamMode            string                      `json:"stream_mode"`
	RequestTimeoutSeconds int                         `json:"request_timeout_seconds"`
	MaxOutputTokens       int                         `json:"max_output_tokens"`
	APIKeyLast4           string                      `json:"api_key_last4,omitempty"`
	HasAPIKey             bool                        `json:"has_api_key,omitempty"`
	IsDefaultWriting      bool                        `json:"is_default_writing,omitempty"`
	IsDefaultImage        bool                        `json:"is_default_image,omitempty"`
	CreatedAt             string                      `json:"created_at,omitempty"`
	UpdatedAt             string                      `json:"updated_at,omitempty"`
}

type providerExportItem struct {
	Name                  string                      `json:"name"`
	ProviderType          providerdomain.ProviderType `json:"provider_type"`
	Vendor                providerdomain.ProviderVendor `json:"vendor,omitempty"`
	BaseURL               string                      `json:"base_url"`
	Model                 string                      `json:"model"`
	Enabled               bool                        `json:"enabled"`
	IsDefaultWriting      bool                        `json:"is_default_writing,omitempty"`
	IsDefaultImage        bool                        `json:"is_default_image,omitempty"`
	ProtocolMode          string                      `json:"protocol_mode,omitempty"`
	StreamMode            string                      `json:"stream_mode,omitempty"`
	RequestTimeoutSeconds int                         `json:"request_timeout_seconds"`
	MaxOutputTokens       int                         `json:"max_output_tokens"`
}

type providerImportItem struct {
	Name                  string                      `json:"name"`
	ProviderType          providerdomain.ProviderType `json:"provider_type"`
	Vendor                providerdomain.ProviderVendor `json:"vendor,omitempty"`
	BaseURL               string                      `json:"base_url"`
	Model                 string                      `json:"model"`
	APIKey                string                      `json:"api_key,omitempty"`
	Enabled               *bool                       `json:"enabled,omitempty"`
	IsDefaultWriting      bool                        `json:"is_default_writing,omitempty"`
	IsDefaultImage        bool                        `json:"is_default_image,omitempty"`
	ProtocolMode          string                      `json:"protocol_mode,omitempty"`
	StreamMode            string                      `json:"stream_mode,omitempty"`
	RequestTimeoutSeconds int                         `json:"request_timeout_seconds,omitempty"`
	MaxOutputTokens       int                         `json:"max_output_tokens,omitempty"`
}

func parseProviderImportPayload(raw []byte) ([]providerImportItem, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("empty import payload")
	}
	if trimmed[0] == '[' {
		var list []providerImportItem
		if err := json.Unmarshal(trimmed, &list); err != nil {
			return nil, err
		}
		return list, nil
	}
	var wrapper struct {
		Data      json.RawMessage      `json:"data"`
		Providers []providerImportItem `json:"providers"`
		Items     []providerImportItem `json:"items"`
	}
	if err := json.Unmarshal(trimmed, &wrapper); err == nil {
		if len(wrapper.Providers) > 0 {
			return wrapper.Providers, nil
		}
		if len(wrapper.Items) > 0 {
			return wrapper.Items, nil
		}
		if len(wrapper.Data) > 0 {
			return parseProviderImportPayload(wrapper.Data)
		}
	}
	var single providerImportItem
	if err := json.Unmarshal(trimmed, &single); err == nil && (single.Model != "" || single.Name != "") {
		return []providerImportItem{single}, nil
	}
	return nil, fmt.Errorf("invalid provider import format")
}

func resolveUniqueProviderName(baseName string, existingNames map[string]bool) string {
	candidate := strings.TrimSpace(baseName)
	if candidate == "" {
		candidate = "Imported Provider"
	}
	lower := strings.ToLower(candidate)
	if !existingNames[lower] {
		existingNames[lower] = true
		return candidate
	}
	counter := 1
	for {
		next := fmt.Sprintf("%s (%d)", candidate, counter)
		nextLower := strings.ToLower(next)
		if !existingNames[nextLower] {
			existingNames[nextLower] = true
			return next
		}
		counter++
	}
}

func (ctrl *Controller) ExportProviders(c *gin.Context) {
	items, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	exportList := make([]providerExportItem, 0, len(items))
	for _, item := range items {
		exportList = append(exportList, providerExportItem{
			Name:                  item.Name,
			ProviderType:          item.ProviderType,
			Vendor:                item.Vendor,
			BaseURL:               item.BaseURL,
			Model:                 item.Model,
			Enabled:               item.Enabled,
			IsDefaultWriting:      item.IsDefaultWriting,
			IsDefaultImage:        item.IsDefaultImage,
			ProtocolMode:          item.ProtocolMode,
			StreamMode:            item.StreamMode,
			RequestTimeoutSeconds: item.RequestTimeoutSeconds,
			MaxOutputTokens:       item.MaxOutputTokens,
		})
	}
	c.Header("Content-Disposition", `attachment; filename="model-connections.json"`)
	c.JSON(http.StatusOK, exportList)
}

func (ctrl *Controller) ImportProviders(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "failed to read request body"))
		return
	}
	items, err := parseProviderImportPayload(raw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if len(items) == 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "no provider configurations found to import"))
		return
	}

	existingProviders, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	existingNames := make(map[string]bool, len(existingProviders)+len(items))
	for _, p := range existingProviders {
		existingNames[strings.ToLower(strings.TrimSpace(p.Name))] = true
	}

	importedProfiles := make([]*providerdomain.ProviderProfile, 0, len(items))
	for _, item := range items {
		pType := item.ProviderType
		if pType == "" {
			pType = providerdomain.ProviderOpenAI
		}
		vendor := item.Vendor
		if vendor == "" {
			vendor = providerdomain.DefaultVendor(pType)
		}
		baseURL := item.BaseURL
		if baseURL == "" {
			switch pType {
			case providerdomain.ProviderAnthropic:
				baseURL = "https://api.anthropic.com"
			case providerdomain.ProviderGemini:
				baseURL = "https://generativelanguage.googleapis.com"
			default:
				baseURL = "https://api.openai.com"
			}
		}
		name := resolveUniqueProviderName(item.Name, existingNames)
		timeout := item.RequestTimeoutSeconds
		if timeout <= 0 {
			timeout = 60
		}
		maxTokens := item.MaxOutputTokens
		if maxTokens <= 0 {
			maxTokens = 2000
		}
		enabled := true
		if item.Enabled != nil {
			enabled = *item.Enabled
		} else if item.APIKey == "" {
			enabled = false
		}
		apiKey := item.APIKey
		if apiKey == "" {
			apiKey = "placeholder-key-please-update"
		}

		profile := &providerdomain.ProviderProfile{
			Name:                  name,
			ProviderType:          pType,
			Vendor:                vendor,
			BaseURL:               baseURL,
			Model:                 strings.TrimSpace(item.Model),
			Enabled:               enabled,
			ProtocolMode:          strings.TrimSpace(item.ProtocolMode),
			StreamMode:            strings.TrimSpace(item.StreamMode),
			RequestTimeoutSeconds: timeout,
			MaxOutputTokens:       maxTokens,
		}
		if err := ctrl.svc.SaveProvider(c.Request.Context(), profile, apiKey); err != nil {
			controllerutil.WriteDomainError(c, err)
			return
		}
		importedProfiles = append(importedProfiles, profile)
	}

	_, _ = ctrl.svc.BootstrapStarterPack(c.Request.Context())
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(gin.H{
		"imported_count": len(importedProfiles),
		"profiles":       importedProfiles,
	}))
}

func (ctrl *Controller) ListProviders(c *gin.Context) {
	items, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) SetDefaultProvider(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid provider id"))
		return
	}
	purpose := c.Param("purpose")
	if err := ctrl.svc.SetDefaultProvider(c.Request.Context(), id, purpose); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) CreateProvider(c *gin.Context) {
	ctrl.saveProvider(c, 0)
}

func (ctrl *Controller) UpdateProvider(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveProvider(c, id)
}

func (ctrl *Controller) saveProvider(c *gin.Context, id int64) {
	var req providerRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	profile := &providerdomain.ProviderProfile{
		ID: id, Name: req.Name, ProviderType: req.ProviderType, Vendor: req.Vendor, BaseURL: req.BaseURL,
		Model: req.Model, Enabled: req.Enabled, ProtocolMode: strings.TrimSpace(req.ProtocolMode),
		StreamMode:            strings.TrimSpace(req.StreamMode),
		RequestTimeoutSeconds: req.RequestTimeoutSeconds, MaxOutputTokens: req.MaxOutputTokens,
	}
	if err := ctrl.svc.SaveProvider(c.Request.Context(), profile, req.APIKey); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	created, err := ctrl.svc.BootstrapStarterPack(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(gin.H{"profile": profile, "starter_agents_created": created}))
}
func (ctrl *Controller) DeleteProvider(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteProvider(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) TestProvider(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	duration, err := ctrl.svc.TestProvider(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"ok": true, "latency_ms": duration.Milliseconds()}))
}

func (ctrl *Controller) ListAgents(c *gin.Context) {
	items, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) ListSkills(c *gin.Context) {
	items, err := ctrl.svc.ListSkills(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) GetSkill(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.svc.GetSkill(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) CreateSkill(c *gin.Context) { ctrl.saveSkill(c, 0) }

func (ctrl *Controller) UpdateSkill(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveSkill(c, id)
}

func (ctrl *Controller) saveSkill(c *gin.Context, id int64) {
	var value domain.AgentSkill
	if err := bindHumanTemplateJSON(c, &value); err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		}
		return
	}
	value.ID = id
	if err := ctrl.svc.SaveSkill(c.Request.Context(), &value); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *Controller) DeleteSkill(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteSkill(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ListSkillVersions(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.svc.ListSkillVersions(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) ExportSkill(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.svc.GetSkill(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="skill-%d-v%d.json"`, item.ID, item.Version))
	c.JSON(http.StatusOK, item)
}

func (ctrl *Controller) ImportSkill(c *gin.Context) {
	var item domain.AgentSkill
	if err := bindAgentJSON(c, &item); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "local principal is required"))
		return
	}
	item.CreatedByPrincipalID = &principalID
	if err := ctrl.svc.ImportSkill(c.Request.Context(), &item); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(&item))
}

func (ctrl *Controller) CopySkill(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if c.Request.ContentLength > 0 {
		if err := bindAgentJSON(c, &req); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
	}
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "local principal is required"))
		return
	}
	item, err := ctrl.svc.CopySkill(c.Request.Context(), id, req.Name, principalID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) GetAgent(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.svc.GetAgent(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) CreateAgent(c *gin.Context) {
	ctrl.saveAgent(c, 0)
}

func (ctrl *Controller) UpdateAgent(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveAgent(c, id)
}

func (ctrl *Controller) saveAgent(c *gin.Context, id int64) {
	var value domain.Agent
	if err := bindHumanTemplateJSON(c, &value); err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		}
		return
	}
	value.ID = id
	if err := ctrl.svc.SaveAgent(c.Request.Context(), &value); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *Controller) DeleteAgent(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteAgent(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) SetAgentEnabled(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	enabled := c.Param("action") == "enable"
	if err := ctrl.svc.SetAgentEnabled(c.Request.Context(), id, enabled); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *Controller) EnableAgent(c *gin.Context) {
	ctrl.setEnabled(c, true)
}

func (ctrl *Controller) DisableAgent(c *gin.Context) {
	ctrl.setEnabled(c, false)
}

func (ctrl *Controller) setEnabled(c *gin.Context, enabled bool) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.SetAgentEnabled(c.Request.Context(), id, enabled); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *Controller) RunAgent(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var input json.RawMessage
	if c.Request.ContentLength > 0 {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
		var request struct {
			Input json.RawMessage `json:"input"`
		}
		if err := bindAgentJSON(c, &request); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		input = request.Input
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	run, err := ctrl.runner.Queue(c.Request.Context(), id, domain.AgentTriggerManual, &principalID, input, nil)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	go ctrl.runner.Execute(ctrl.workerCtx, run.ID)
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *Controller) ListRuns(c *gin.Context) {
	agentIDValue, _ := strconv.ParseInt(c.Query("agent_id"), 10, 64)
	page, pageSize := controllerutil.ExtractPagination(c, 50)
	items, total, err := ctrl.runner.ListRuns(c.Request.Context(), agentIDValue, page, pageSize)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	controllerutil.WritePaginated(c, items, total, page, pageSize)
}

func (ctrl *Controller) DeleteRun(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.runner.DeleteRun(c.Request.Context(), id); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) GetRun(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	run, err := ctrl.runner.GetRun(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	calls, err := ctrl.runner.ListToolCalls(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"run": run, "tool_calls": calls}))
}

func (ctrl *Controller) ToolCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(ctrl.tools.Catalog()))
}

func (ctrl *Controller) ListApprovals(c *gin.Context) {
	page, pageSize := controllerutil.ExtractPagination(c, 50)
	items, total, err := ctrl.approvals.List(c.Request.Context(), c.DefaultQuery("status", "pending"), page, pageSize)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	controllerutil.WritePaginated(c, items, total, page, pageSize)
}

type approvalReviewRequest struct {
	Note string `json:"note"`
}

func (ctrl *Controller) Approve(c *gin.Context) {
	ctrl.reviewApproval(c, true)
}

func (ctrl *Controller) Reject(c *gin.Context) {
	ctrl.reviewApproval(c, false)
}

func (ctrl *Controller) reviewApproval(c *gin.Context, approve bool) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req approvalReviewRequest
	if c.Request.ContentLength > 0 {
		if err := bindAgentJSON(c, &req); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
	}
	raw, exists := c.Get("blog_principal_id")
	reviewerPrincipalID, ok := raw.(int64)
	if !exists || !ok || reviewerPrincipalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	var err error
	if approve {
		err = ctrl.approvals.Approve(c.Request.Context(), id, reviewerPrincipalID, req.Note)
		if err == nil {
			go func() {
				_ = ctrl.approvals.StartImageGenerationForApprovedBrief(ctrl.workerCtx, id, reviewerPrincipalID)
			}()
		}
	} else {
		err = ctrl.approvals.Reject(c.Request.Context(), id, reviewerPrincipalID, req.Note)
	}
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	run, reconcileErr := ctrl.approvals.ReconcileApprovalRun(c.Request.Context(), id)
	if reconcileErr != nil {
		controllerutil.WriteDomainError(c, reconcileErr)
		return
	}
	if run.WorkflowRunID != nil && run.Status != domain.AgentRunAwaitingApproval {
		if approve && run.Status == domain.AgentRunSucceeded {
			_ = ctrl.workflows.ResumeAfterApproval(c.Request.Context(), *run.WorkflowRunID)
		} else if run.Status == domain.AgentRunCancelled {
			_ = ctrl.workflows.Cancel(c.Request.Context(), *run.WorkflowRunID)
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func bindAgentJSON(c *gin.Context, value any) error {
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("request body must contain one JSON object")
	}
	return binding.Validator.ValidateStruct(value)
}

func bindWorkflowJSON(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWorkflowJSONBody)
	if err := bindAgentJSON(c, value); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gouno.NewErrorResponse(http.StatusRequestEntityTooLarge, "workflow request body exceeds 256 KiB"))
		} else {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		}
		return false
	}
	return true
}

// Response-only provenance is ignored on input. Every new version is attributed
// to the authenticated local actor, including edits of system templates.
func bindHumanTemplateJSON(c *gin.Context, value any) error {
	if err := bindAgentJSON(c, value); err != nil {
		return err
	}
	raw, exists := c.Get("blog_principal_id")
	principal, ok := raw.(int64)
	if !exists || !ok || principal <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return fmt.Errorf("authenticated local principal is required")
	}
	switch v := value.(type) {
	case *domain.Agent:
		v.CreatedByPrincipalID = &principal
		v.CreationOrigin = ""
	case *domain.AgentSkill:
		v.CreatedByPrincipalID = &principal
		v.CreationOrigin = ""
	case *workflowdomain.Workflow:
		v.CreatedByPrincipalID = &principal
		v.CreationOrigin = ""
	default:
		return fmt.Errorf("unsupported human template")
	}
	return nil
}
