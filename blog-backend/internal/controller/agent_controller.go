package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/blog-backend/internal/operations"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/tool"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/gouno"
)

type AgentController struct {
	svc        *agentservice.ManagementService
	runner     *agentservice.Runner
	approvals  *agentservice.ApprovalService
	tools      *tool.Registry
	workerCtx  context.Context
	knowledge  *knowledge.Service
	workflows  *workflowservice.Service
	operations *operations.Service
}

type draftAssistRequest struct {
	Task    string `json:"task" binding:"required"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Content string `json:"content"`
}

type workflowDraftRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

// workflowPlannerPrompt is versioned alongside the executable workflow
// contract. Product changes must update this prompt and the validator together;
// the model never gets authority to create, enable, or run a workflow.
const workflowPlannerPrompt = `You are workflow-planner/v1 for a blog administration product. Return only valid JSON with name, description, input_schema, and steps. Convert the user's goal into a small, safe workflow draft. Use only the supplied Agent IDs, and only model, approval_gate, and output steps. A model step must use one supplied Agent ID and an input_pointer beginning with /input. Include one approval_gate after any model step whose Agent execution_mode is approval. Finish with one output step whose output_pointer references a preceding step, for example /steps/analyze. Input schema must be a JSON Schema object with type object and additionalProperties false. Keep at most 5 steps. Do not create, enable, run, publish, or modify anything. Do not use Markdown or explanation.`

// DraftWorkflow asks the default writing model to prepare a portable workflow
// definition. It never persists the result; users review it in the editor.
func (ctrl *AgentController) DraftWorkflow(c *gin.Context) {
	var req workflowDraftRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" || len([]rune(req.Prompt)) > 4000 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "workflow goal is required and must be at most 4000 characters"))
		return
	}
	profiles, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	var selected *domain.ProviderProfile
	for _, profile := range profiles {
		if profile.Enabled && profile.IsDefaultWriting {
			selected = profile
			break
		}
	}
	if selected == nil {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "an enabled default writing model is required"))
		return
	}
	agents, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	available := make([]map[string]any, 0, len(agents))
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil {
			available = append(available, map[string]any{"id": agent.ID, "name": agent.Name, "description": agent.Description, "execution_mode": agent.ExecutionMode, "capabilities": agent.Capabilities})
		}
	}
	if len(available) == 0 {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "create an enabled Agent with a saved Skill before planning a workflow"))
		return
	}
	client, err := ctrl.svc.ProviderClient(c.Request.Context(), selected.ID)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	payload, _ := json.Marshal(map[string]any{"goal": req.Prompt, "available_agents": available})
	// A workflow plan is deliberately small (at most five steps); constraining
	// output keeps the interactive creator responsive on slower providers.
	result, err := client.Generate(c.Request.Context(), provider.Request{Instructions: workflowPlannerPrompt, Messages: []provider.Message{{Role: "user", Content: string(payload)}}, MaxTokens: min(selected.MaxOutputTokens, 800)})
	if err != nil {
		writeAgentError(c, err)
		return
	}
	text := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(result.Text), "```json"), "```"))
	var draft domain.Workflow
	if err := json.Unmarshal([]byte(text), &draft); err != nil {
		c.JSON(http.StatusBadGateway, gouno.NewErrorResponse(http.StatusBadGateway, "AI returned an invalid workflow draft"))
		return
	}
	draft.Enabled = false
	if err := ctrl.workflows.ValidateDraft(&draft); err != nil {
		c.JSON(http.StatusBadGateway, gouno.NewErrorResponse(http.StatusBadGateway, "AI returned an unsafe or unsupported workflow draft"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"workflow": draft, "provider": selected.Name, "model": selected.Model, "planner_version": "workflow-planner/v1"}))
}

// DraftAssist is deliberately suggestion-only: it never persists or publishes
// content. The editor remains the place where an author reviews and applies a
// candidate to their unsaved draft.
func (ctrl *AgentController) DraftAssist(c *gin.Context) {
	var req draftAssistRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	req.Task = strings.TrimSpace(req.Task)
	req.Title, req.Summary, req.Content = strings.TrimSpace(req.Title), strings.TrimSpace(req.Summary), strings.TrimSpace(req.Content)
	if (req.Task != "title" && req.Task != "summary" && req.Task != "slug") || len([]rune(req.Content)) > 50000 || (req.Title == "" && req.Content == "") {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "task and article content are required"))
		return
	}
	profiles, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	var selected *domain.ProviderProfile
	for _, profile := range profiles {
		if profile.Enabled && profile.IsDefaultWriting {
			selected = profile
			break
		}
	}
	if selected == nil {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "an enabled default AI provider is required"))
		return
	}
	client, err := ctrl.svc.ProviderClient(c.Request.Context(), selected.ID)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	instruction := "You are an editorial assistant for a blog. Return only valid JSON in the form {\"suggestions\":[\"...\"]}. Produce exactly three concise candidates. Do not explain, use Markdown, or change the article."
	if req.Task == "title" {
		instruction += " Create specific Chinese article titles that accurately reflect the supplied draft."
	} else if req.Task == "summary" {
		instruction += " Create Chinese summaries, each at most 300 Chinese characters, that accurately reflect the supplied draft."
	} else {
		instruction += " Create lowercase URL slugs using ASCII letters, numbers, and hyphens only."
	}
	prompt, _ := json.Marshal(map[string]string{"title": req.Title, "summary": req.Summary, "content": req.Content})
	result, err := client.Generate(c.Request.Context(), provider.Request{Instructions: instruction, Messages: []provider.Message{{Role: "user", Content: string(prompt)}}, MaxTokens: min(selected.MaxOutputTokens, 500)})
	if err != nil {
		writeAgentError(c, err)
		return
	}
	var output struct {
		Suggestions []string `json:"suggestions"`
	}
	text := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(result.Text), "```json"), "```"))
	if err := json.Unmarshal([]byte(text), &output); err != nil || len(output.Suggestions) == 0 {
		c.JSON(http.StatusBadGateway, gouno.NewErrorResponse(http.StatusBadGateway, "AI returned an invalid suggestion response"))
		return
	}
	seen, suggestions := map[string]bool{}, make([]string, 0, 3)
	for _, suggestion := range output.Suggestions {
		suggestion = strings.TrimSpace(suggestion)
		if suggestion != "" && !seen[suggestion] {
			seen[suggestion] = true
			suggestions = append(suggestions, suggestion)
			if len(suggestions) == 3 {
				break
			}
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"suggestions": suggestions, "provider": selected.Name, "model": selected.Model}))
}

func (ctrl *AgentController) SetWorkflowService(service *workflowservice.Service) {
	ctrl.workflows = service
}

func (ctrl *AgentController) SetOperationsService(service *operations.Service) {
	ctrl.operations = service
}

func (ctrl *AgentController) ListSuggestions(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
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
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
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
	creator, _ := c.Get("account_id")
	creatorText, _ := creator.(string)
	// Image providers can take considerably longer than an HTTP request timeout.
	// The approval service persists every state transition, so run generation in
	// the worker context and let the UI observe generating/generated/failed.
	go func() {
		_ = ctrl.approvals.GenerateMediaCandidate(ctrl.workerCtx, id, creatorText)
	}()
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
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

func (ctrl *AgentController) ListWorkflows(c *gin.Context) {
	items, err := ctrl.workflows.List(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) GetWorkflow(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	item, err := ctrl.workflows.Get(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) CreateWorkflow(c *gin.Context) { ctrl.saveWorkflow(c, 0) }

func (ctrl *AgentController) UpdateWorkflow(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	ctrl.saveWorkflow(c, id)
}

func (ctrl *AgentController) DeleteWorkflow(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.workflows.Delete(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) saveWorkflow(c *gin.Context, id int64) {
	var value domain.Workflow
	if err := bindAgentJSON(c, &value); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	value.ID = id
	if subject, exists := c.Get("account_id"); exists {
		if text, ok := subject.(string); ok && text != "" {
			value.CreatedBy = &text
		}
	}
	if err := ctrl.workflows.Save(c.Request.Context(), &value); err != nil {
		writeAgentError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *AgentController) ListWorkflowVersions(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	items, err := ctrl.workflows.Versions(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) RollbackWorkflow(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req struct {
		Version int `json:"version" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.workflows.Rollback(c.Request.Context(), id, req.Version); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) EnableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, true) }

func (ctrl *AgentController) DisableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, false) }

func (ctrl *AgentController) setWorkflowEnabled(c *gin.Context, enabled bool) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var subject *string
	if raw, exists := c.Get("account_id"); exists {
		if text, ok := raw.(string); ok && text != "" {
			subject = &text
		}
	}
	if err := ctrl.workflows.SetEnabled(c.Request.Context(), id, enabled, subject); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *AgentController) RunWorkflow(c *gin.Context)    { ctrl.queueWorkflow(c, false) }
func (ctrl *AgentController) DryRunWorkflow(c *gin.Context) { ctrl.queueWorkflow(c, true) }

func (ctrl *AgentController) queueWorkflow(c *gin.Context, dryRun bool) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	var req struct {
		Input json.RawMessage `json:"input"`
	}
	if c.Request.ContentLength > 0 {
		if err := bindAgentJSON(c, &req); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
	}
	var subject *string
	if raw, exists := c.Get("account_id"); exists {
		if text, ok := raw.(string); ok && text != "" {
			subject = &text
		}
	}
	run, err := ctrl.workflows.Queue(c.Request.Context(), id, dryRun, req.Input, subject)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	if run.Status == "queued" {
		go ctrl.workflows.Execute(ctrl.workerCtx, run.ID)
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *AgentController) ListWorkflowRuns(c *gin.Context) {
	workflowID, _ := strconv.ParseInt(c.Query("workflow_id"), 10, 64)
	items, err := ctrl.workflows.ListRuns(c.Request.Context(), workflowID)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunSteps(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	items, err := ctrl.workflows.RunSteps(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowMetrics(c *gin.Context) {
	result, err := ctrl.workflows.Metrics(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func NewAgentController(svc *agentservice.ManagementService, runner *agentservice.Runner, approvals *agentservice.ApprovalService, tools *tool.Registry, workerCtx context.Context, knowledgeServices ...*knowledge.Service) *AgentController {
	var knowledgeService *knowledge.Service
	if len(knowledgeServices) > 0 {
		knowledgeService = knowledgeServices[0]
	}
	return &AgentController{svc: svc, runner: runner, approvals: approvals, tools: tools, workerCtx: workerCtx, knowledge: knowledgeService}
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

func (ctrl *AgentController) SetDefaultProvider(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	purpose := c.Param("purpose")
	if err := ctrl.svc.SetDefaultProvider(c.Request.Context(), id, purpose); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
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
	if err := bindAgentJSON(c, &req); err != nil {
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

type embeddingProfileRequest struct {
	Name                  string `json:"name" binding:"required"`
	BaseURL               string `json:"base_url" binding:"required"`
	Model                 string `json:"model" binding:"required"`
	Dimensions            int    `json:"dimensions" binding:"required"`
	APIKey                string `json:"api_key"`
	Enabled               bool   `json:"enabled"`
	RequestTimeoutSeconds int    `json:"request_timeout_seconds"`
}

func (ctrl *AgentController) ListEmbeddingProfiles(c *gin.Context) {
	items, err := ctrl.knowledge.ListProfiles(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) CreateEmbeddingProfile(c *gin.Context) { ctrl.saveEmbeddingProfile(c, 0) }

func (ctrl *AgentController) UpdateEmbeddingProfile(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	ctrl.saveEmbeddingProfile(c, id)
}

func (ctrl *AgentController) saveEmbeddingProfile(c *gin.Context, id int64) {
	var req embeddingProfileRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	value := &domain.EmbeddingProfile{ID: id, Name: req.Name, BaseURL: req.BaseURL,
		Model: req.Model, Dimensions: req.Dimensions, Enabled: req.Enabled,
		RequestTimeoutSeconds: req.RequestTimeoutSeconds}
	if err := ctrl.knowledge.SaveProfile(c.Request.Context(), value, req.APIKey); err != nil {
		writeAgentError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(value))
}

func (ctrl *AgentController) DeleteEmbeddingProfile(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.knowledge.DeleteProfile(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) TestEmbeddingProfile(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	duration, err := ctrl.knowledge.TestProfile(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"ok": true, "latency_ms": duration.Milliseconds()}))
}

func (ctrl *AgentController) IndexStatus(c *gin.Context) {
	value, err := ctrl.knowledge.Status(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(value))
}

func (ctrl *AgentController) RebuildIndex(c *gin.Context) {
	if err := ctrl.knowledge.Rebuild(c.Request.Context()); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) RetryIndex(c *gin.Context) {
	if err := ctrl.knowledge.RetryFailed(c.Request.Context()); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ReplaceIndexEvaluation(c *gin.Context) {
	var req struct {
		Cases []knowledge.EvaluationCase `json:"cases" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.knowledge.ReplaceEvaluationCases(c.Request.Context(), req.Cases); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) EvaluateIndex(c *gin.Context) {
	result, err := ctrl.knowledge.Evaluate(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *AgentController) ListAgents(c *gin.Context) {
	items, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) ListSkills(c *gin.Context) {
	items, err := ctrl.svc.ListSkills(c.Request.Context())
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) GetSkill(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	item, err := ctrl.svc.GetSkill(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) CreateSkill(c *gin.Context) { ctrl.saveSkill(c, 0) }

func (ctrl *AgentController) UpdateSkill(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	ctrl.saveSkill(c, id)
}

func (ctrl *AgentController) saveSkill(c *gin.Context, id int64) {
	var value domain.AgentSkill
	if err := bindAgentJSON(c, &value); err != nil {
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
	if err := ctrl.svc.SaveSkill(c.Request.Context(), &value); err != nil {
		writeAgentError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *AgentController) DeleteSkill(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteSkill(c.Request.Context(), id); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ListSkillVersions(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	items, err := ctrl.svc.ListSkillVersions(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) ExportSkill(c *gin.Context) {
	id, ok := agentID(c)
	if !ok {
		return
	}
	item, err := ctrl.svc.GetSkill(c.Request.Context(), id)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="skill-%d-v%d.json"`, item.ID, item.Version))
	c.JSON(http.StatusOK, item)
}

func (ctrl *AgentController) ImportSkill(c *gin.Context) {
	var item domain.AgentSkill
	if err := bindAgentJSON(c, &item); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if subject, exists := c.Get("account_id"); exists {
		if text, ok := subject.(string); ok && text != "" {
			item.CreatedBy = &text
		}
	}
	if err := ctrl.svc.ImportSkill(c.Request.Context(), &item); err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(&item))
}

func (ctrl *AgentController) SaveAgentAsSkill(c *gin.Context) {
	id, ok := agentID(c)
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
	var subject *string
	if raw, exists := c.Get("account_id"); exists {
		if text, ok := raw.(string); ok && text != "" {
			subject = &text
		}
	}
	item, err := ctrl.svc.SaveAgentAsSkill(c.Request.Context(), id, req.Name, subject)
	if err != nil {
		writeAgentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(item))
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
	if err := bindAgentJSON(c, &value); err != nil {
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
		if err := bindAgentJSON(c, &request); err != nil {
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
		if err := bindAgentJSON(c, &req); err != nil {
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
	case errors.Is(err, workflowservice.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, workflowservice.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, workflowservice.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, knowledge.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, knowledge.ErrNotFound):
		status = http.StatusNotFound
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
	message := err.Error()
	if status >= http.StatusInternalServerError {
		message = "internal server error"
	}
	c.JSON(status, gouno.NewErrorResponse(status, message))
}
