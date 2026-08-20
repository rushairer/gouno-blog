package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/blog-backend/internal/workflowplan"
	"github.com/rushairer/gouno"
)

type draftAssistRequest struct {
	Task    string `json:"task" binding:"required"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Content string `json:"content"`
}

type workflowDraftRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

type automationPlanRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

func (ctrl *AgentController) DraftAutomationPlan(c *gin.Context) {
	var req automationPlanRequest
	if !bindWorkflowJSON(c, &req) {
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" || len([]rune(req.Prompt)) > 4000 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "automation goal is required and must be at most 4000 characters"))
		return
	}
	profiles, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	agents, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	skills, err := ctrl.svc.ListSkills(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	plan := workflowplan.BuildAutomationPlan(req.Prompt, profiles, agents, skills)
	intent := workflowplan.ParseIntent(req.Prompt)
	for _, agent := range agents {
		if agent.ProviderProfile == nil {
			for _, profile := range profiles {
				if profile.ID == agent.ProviderProfileID {
					agent.ProviderProfile = profile
					break
				}
			}
		}
	}
	match, template, selectedAgent := workflowplan.Match(intent, profiles, agents, skills, ctrl.tools.Catalog())
	plan.Intent, plan.Match = intent, match
	plan.Template = map[string]any{"status": "unsupported"}
	if template != nil {
		plan.Template = map[string]any{"status": "matched", "key": template.Key, "name": template.Name}
		plan.Workflow = workflowplan.Compile(intent, template, selectedAgent)
		if match.Status != "ready" {
			plan.Workflow.Enabled = false
		}
	}
	if intent.Status == "ambiguous" {
		plan.Template = map[string]any{"status": "ambiguous"}
		plan.Prerequisites = append(plan.Prerequisites, "补充明确的资源类型和操作目标")
	}
	plan.Warnings = append(plan.Warnings, match.Warnings...)
	plan.Prerequisites = append(plan.Prerequisites, match.Missing...)
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(plan))
}

const workflowPlannerPrompt = `You are workflow-planner/v6 for a blog administration product. Return exactly one JSON object and nothing else: no Markdown, code fence, commentary, or prose.
Your goal is to convert the user's goal into a small, safe, and executable workflow draft.
Required top-level JSON keys: name, description, input_schema, steps. Optional key: cron_expression.

Allowed step types:
1. "resource_query": {"id": "select_resources", "type": "resource_query", "resource_type": "post"|"page"|"comment"|"media_asset", "filter": {}, "max_items": 20} (top-level only, before model/for_each).
2. "for_each": {"id": "process_items", "type": "for_each", "collection_pointer": "/steps/select_resources", "max_items": 20, "max_concurrency": 0, "continue_on_error": true, "steps": [{"id": "item_model", "type": "model", "agent_id": <id>, "input_pointer": "/item", "include_context": true}]}
3. "model": {"id": "analyze", "type": "model", "agent_id": <id>, "input_pointer": "/input"|"/item"|"/steps/<prev_step_id>", "include_context": true}
4. "approval_gate": {"id": "review", "type": "approval_gate", "name": "人工审批", "input_pointer": "/steps/<prev_step_id>"}
   Include approval_gate only when the concrete operation creates a content-change proposal and the user did not ask for direct execution or no approval.
   A bounded internal image task created through media.create_image_task does not modify or publish an article and must not add a redundant approval_gate; selecting and applying the generated image remains a separate explicit user action.
5. "output": {"id": "result", "type": "output", "output_pointer": "/steps/<prev_step_id>"}

Agent Selection & Input Schema Rules:
- agent_id in model steps MUST be an integer chosen from the supplied available_agents.
- input_schema must be a JSON Schema object with "type": "object" and "additionalProperties": false.
- When the goal requires choosing articles, use post_ids as an integer array resource field with x-gouno-resource post and x-gouno-widget entity-multi-select.
- When the goal requires choosing custom pages, use page_ids as an integer array resource field with x-gouno-resource page and x-gouno-widget entity-multi-select.
- When the goal requires choosing comments, use comment_ids with x-gouno-resource comment and x-gouno-widget entity-multi-select.
- When the goal requires custom text instructions or user prompt, add a string property named prompt.
- For image, cover, illustration, or 配图 goals, add a required string format property with enum ["image_brief"], and pass the complete /input object to the model step.
- All JSON Pointer values must start with a leading slash '/'.
- Keep at most 5 top-level steps. Do not invent image, tool, connector, HTTP, publish, or other step types. Do not create, enable, run, publish, or modify anything.`

const workflowPlannerCorrectionPrompt = `The previous response was not a valid Workflow draft. Return a corrected JSON object only. Keep exactly the allowed keys name, description, input_schema, and steps. Steps may only be resource_query, for_each, model, approval_gate, and output; agent_id must be an integer from the supplied available_agents; never add image, tool, connector, HTTP, or publish steps. For image-related goals, use the Agent's authorized media.create_image_task capability and do not add approval_gate; image selection and application remain explicit user actions. Use post_ids for posts, page_ids for pages, and prompt for text instructions when required. input_schema must be an object schema with additionalProperties false.`

func isCustomOrCompositeGoal(goal string) bool {
	value := strings.ToLower(goal)
	return strings.Contains(value, "提示词") ||
		strings.Contains(value, "prompt") ||
		strings.Contains(value, "输入") ||
		strings.Contains(value, "指令") ||
		strings.Contains(value, "要求") ||
		strings.Contains(value, "每天") ||
		strings.Contains(value, "每周") ||
		strings.Contains(value, "定时") ||
		strings.Contains(value, "cron") ||
		strings.Contains(value, "循环") ||
		strings.Contains(value, "逐篇") ||
		strings.Contains(value, "逐个") ||
		strings.Contains(value, "批量") ||
		strings.Contains(value, "先") ||
		strings.Contains(value, "然后") ||
		strings.Contains(value, "再由") ||
		strings.Contains(value, "不需要审核") ||
		strings.Contains(value, "无需审核") ||
		strings.Contains(value, "不需要审批") ||
		strings.Contains(value, "无需审批") ||
		strings.Contains(value, "直接运行")
}

func (ctrl *AgentController) DraftWorkflow(c *gin.Context) {
	var req workflowDraftRequest
	if !bindWorkflowJSON(c, &req) {
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" || len([]rune(req.Prompt)) > 4000 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "workflow goal is required and must be at most 4000 characters"))
		return
	}
	profiles, err := ctrl.svc.ListProviders(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
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
		WriteDomainError(c, err)
		return
	}
	available := make([]map[string]any, 0, len(agents))
	var fallbackAgentID int64
	fallbackNeedsApproval := false
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil {
			item := map[string]any{"id": agent.ID, "name": agent.Name, "description": agent.Description, "skill_version_id": agent.SkillVersionID}
			if agent.Skill != nil {
				item["execution_mode"] = agent.Skill.ExecutionMode
				item["capabilities"] = agent.Skill.Capabilities
			}
			available = append(available, item)
			if fallbackAgentID == 0 {
				fallbackAgentID = agent.ID
				fallbackNeedsApproval = agent.Skill != nil && agent.Skill.ExecutionMode == "approval"
			}
		}
	}
	if len(available) == 0 {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "create an enabled Agent with a saved Skill before planning a workflow"))
		return
	}
	intent := workflowplan.ParseIntent(req.Prompt)
	for _, agent := range agents {
		if agent.ProviderProfile == nil {
			for _, profile := range profiles {
				if profile.ID == agent.ProviderProfileID {
					agent.ProviderProfile = profile
					break
				}
			}
		}
	}
	match, template, matchedAgent := workflowplan.Match(intent, profiles, agents, nil, ctrl.tools.Catalog())
	if template != nil && !isCustomOrCompositeGoal(req.Prompt) {
		draft := workflowplan.Compile(intent, template, matchedAgent)
		draft.Enabled = false
		warning := ""
		if intent.Status == "ambiguous" {
			warning = "无法确定需求意图；请补充资源类型和目标动作后再保存。"
		} else if match.Status != "ready" {
			warning = "Workflow 依赖尚未就绪；当前仅返回未启用草案。"
		}
		selectedAgents := []gin.H{}
		if matchedAgent != nil {
			selectedAgents = append(selectedAgents, gin.H{"id": matchedAgent.ID, "name": matchedAgent.Name, "status": "ready", "skill_name": matchedAgent.Skill.Name, "capabilities": matchedAgent.Skill.Capabilities})
		}
		readiness := gin.H{"status": match.Status, "message": "服务端模板和能力契约已生成；请完成依赖确认后 Dry-run。"}
		c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"workflow": draft, "provider": selected.Name, "model": selected.Model, "planner_version": "workflow-planner/v6", "planner_warning": warning, "selected_agents": selectedAgents, "intent": intent, "template": gin.H{"status": "matched", "key": template.Key, "name": template.Name}, "match": match, "readiness": readiness}))
		return
	}
	client, err := ctrl.svc.ProviderClient(c.Request.Context(), selected.ID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"goal":             req.Prompt,
		"available_agents": available,
		"available_tools":  ctrl.tools.Catalog(),
	})
	maxTokens := selected.MaxOutputTokens
	if maxTokens < 3000 {
		maxTokens = 3000
	}
	result, err := client.Generate(c.Request.Context(), provider.Request{Instructions: workflowplan.WorkflowPlannerPrompt, Messages: []provider.Message{{Role: "user", Content: string(payload)}}, MaxTokens: maxTokens})
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	var draft domain.Workflow
	warning := ""
	decodeDraft := func(text string) bool {
		draftJSON, validJSON := workflowplan.ExtractWorkflowDraftJSON(text)
		return validJSON && json.Unmarshal(draftJSON, &draft) == nil
	}
	validDraft := decodeDraft(result.Text)
	if !validDraft {
		correctionPayload, _ := json.Marshal(map[string]any{"goal": req.Prompt, "available_agents": available, "previous_response": result.Text})
		correction, correctionErr := client.Generate(c.Request.Context(), provider.Request{Instructions: workflowplan.WorkflowPlannerCorrectionPrompt, Messages: []provider.Message{{Role: "user", Content: string(correctionPayload)}}, MaxTokens: maxTokens})
		if correctionErr == nil {
			validDraft = decodeDraft(correction.Text)
		}
	}
	if validDraft {
		draft.Steps = workflowplan.NormalizeDraftAgentIDs(draft.Steps, fallbackAgentID)
		if len(draft.InputSchema) == 0 {
			draft.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false}`)
		}
	} else {
		warning = "AI draft format was invalid; a safe editable starter draft was created instead."
		draft = workflowplan.FallbackWorkflowDraft(req.Prompt, fallbackAgentID, true)
	}
	workflowplan.EnforceImageBriefContract(req.Prompt, &draft)
	draft.Enabled = false
	if err := ctrl.workflows.ValidateDraft(&draft); err != nil {
		warning = "AI draft did not meet workflow safety rules; a safe editable starter draft was created instead."
		draft = workflowplan.FallbackWorkflowDraft(req.Prompt, fallbackAgentID, fallbackNeedsApproval)
		if fallbackErr := ctrl.workflows.ValidateDraft(&draft); fallbackErr != nil {
			WriteDomainError(c, fallbackErr)
			return
		}
	}
	availableByID := make(map[int64]*domain.Agent, len(agents))
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil {
			availableByID[agent.ID] = agent
		}
	}
	selectedAgents := []gin.H{}
	for _, id := range workflowplan.WorkflowDraftAgentIDs(draft.Steps) {
		agent, ok := availableByID[id]
		if !ok {
			continue
		}
		selection := gin.H{"id": agent.ID, "name": agent.Name, "status": "ready"}
		if agent.Skill != nil {
			selection["skill_name"] = agent.Skill.Name
			selection["capabilities"] = agent.Skill.Capabilities
		}
		selectedAgents = append(selectedAgents, selection)
	}
	templateStatus := "unsupported"
	templateKey, templateName := "", ""
	if template != nil {
		templateStatus = "matched"
		templateKey, templateName = template.Key, template.Name
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"workflow":         draft,
		"provider":         selected.Name,
		"model":            selected.Model,
		"planner_version":  "workflow-planner/v6",
		"planner_warning":  warning,
		"selected_agents":  selectedAgents,
		"intent":           intent,
		"template":         gin.H{"status": templateStatus, "key": templateKey, "name": templateName},
		"match":            match,
		"readiness":        gin.H{"status": "ready", "message": "Provider, Agent, and Skill bindings were verified for this draft."},
	}))
}

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
		WriteDomainError(c, err)
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
		WriteDomainError(c, err)
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
		WriteDomainError(c, err)
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

func (ctrl *AgentController) ListWorkflows(c *gin.Context) {
	items, err := ctrl.workflows.List(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) GetWorkflow(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.workflows.Get(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) CreateWorkflow(c *gin.Context) { ctrl.saveWorkflow(c, 0) }

func (ctrl *AgentController) UpdateWorkflow(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	ctrl.saveWorkflow(c, id)
}

func (ctrl *AgentController) DeleteWorkflow(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.Delete(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) saveWorkflow(c *gin.Context, id int64) {
	var value domain.Workflow
	if !bindWorkflowJSON(c, &value) {
		return
	}
	value.ID = id
	if subject, exists := c.Get("account_id"); exists {
		if text, ok := subject.(string); ok && text != "" {
			value.CreatedBy = &text
		}
	}
	if err := ctrl.workflows.Save(c.Request.Context(), &value); err != nil {
		WriteDomainError(c, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, gouno.NewSuccessResponse(&value))
}

func (ctrl *AgentController) ListWorkflowVersions(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.Versions(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) RollbackWorkflow(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
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
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) EnableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, true) }

func (ctrl *AgentController) DisableWorkflow(c *gin.Context) { ctrl.setWorkflowEnabled(c, false) }

func (ctrl *AgentController) setWorkflowEnabled(c *gin.Context, enabled bool) {
	id, ok := ParamPositiveID(c, "id")
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
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"enabled": enabled}))
}

func (ctrl *AgentController) RunWorkflow(c *gin.Context)    { ctrl.queueWorkflow(c, false) }
func (ctrl *AgentController) DryRunWorkflow(c *gin.Context) { ctrl.queueWorkflow(c, true) }

func (ctrl *AgentController) PreflightWorkflow(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Input  json.RawMessage `json:"input"`
		DryRun bool            `json:"dry_run"`
	}
	if !bindWorkflowJSON(c, &req) {
		return
	}
	result, err := ctrl.workflows.Preflight(c.Request.Context(), id, req.Input, req.DryRun)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *AgentController) RetryWorkflowRun(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		StepID     string `json:"step_id"`
		Iterations []int  `json:"iterations"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	var subject *string
	if raw, exists := c.Get("account_id"); exists {
		if text, ok := raw.(string); ok && text != "" {
			subject = &text
		}
	}
	run, err := ctrl.workflows.RetryFailed(c.Request.Context(), id, req.StepID, req.Iterations, subject)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	go ctrl.workflows.Execute(ctrl.workerCtx, run.ID)
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(run))
}

func (ctrl *AgentController) DeleteWorkflowRun(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.DeleteRun(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) CancelWorkflowRun(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.workflows.Cancel(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) EmitWorkflowEvent(c *gin.Context) {
	var req struct {
		EventKey string          `json:"event_key" binding:"required"`
		Event    string          `json:"event" binding:"required"`
		Payload  json.RawMessage `json:"payload" binding:"required"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	var subject *string
	if raw, exists := c.Get("account_id"); exists {
		if text, ok := raw.(string); ok && text != "" {
			subject = &text
		}
	}
	queued, err := ctrl.workflows.EmitEvent(c.Request.Context(), req.EventKey, req.Event, req.Payload, subject)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(gin.H{"accepted": true, "queued": queued}))
}

func (ctrl *AgentController) ReceiveWorkflowWebhook(c *gin.Context) {
	secret := strings.TrimSpace(os.Getenv("GOUNO_AI_WEBHOOK_SECRET"))
	if !ValidWebhookSecret(secret) {
		c.JSON(http.StatusServiceUnavailable, gouno.NewErrorResponse(http.StatusServiceUnavailable, "webhook connector is not configured"))
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20+1))
	if err != nil || len(body) == 0 || len(body) > 1<<20 || !json.Valid(body) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "webhook payload must be valid JSON under 1 MiB"))
		return
	}
	signature := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("X-Gouno-Signature"), "sha256="))
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write(body)
	expected := hex.EncodeToString(digest.Sum(nil))
	provided, decodeErr := hex.DecodeString(signature)
	expectedBytes, _ := hex.DecodeString(expected)
	if decodeErr != nil || !hmac.Equal(provided, expectedBytes) {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid webhook signature"))
		return
	}
	eventType := strings.TrimSpace(c.Param("event"))
	eventKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if eventKey == "" {
		digest := sha256.Sum256(append([]byte(eventType+":"), body...))
		eventKey = hex.EncodeToString(digest[:])
	}
	queued, err := ctrl.workflows.EmitEvent(c.Request.Context(), eventKey, eventType, body, nil)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(gin.H{"accepted": true, "queued": queued}))
}

func (ctrl *AgentController) queueWorkflow(c *gin.Context, dryRun bool) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Input json.RawMessage `json:"input"`
	}
	if c.Request.ContentLength > 0 {
		if !bindWorkflowJSON(c, &req) {
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
		WriteDomainError(c, err)
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
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunSteps(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.RunSteps(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunResources(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.workflows.ListResources(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunInteractions(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.approvals.ListInteractions(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunMediaCandidates(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.approvals.ListMediaCandidatesByWorkflowRun(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) WorkflowRunEvents(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	items, err := ctrl.approvals.ListWorkflowRunEvents(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *AgentController) GetInteraction(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	item, err := ctrl.approvals.GetInteraction(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) ListPendingInteractions(c *gin.Context) {
	items, err := ctrl.approvals.ListPendingInteractions(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func interactionSubject(c *gin.Context) string {
	if raw, ok := c.Get("account_id"); ok {
		if value, ok := raw.(string); ok {
			return value
		}
	}
	return "admin"
}

func (ctrl *AgentController) ResolveInteraction(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		ResumeToken string          `json:"resume_token"`
		Response    json.RawMessage `json:"response"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if len(req.Response) == 0 {
		req.Response = json.RawMessage(`{}`)
	}
	item, err := ctrl.approvals.ResolveInteraction(c.Request.Context(), id, req.ResumeToken, req.Response, interactionSubject(c))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if item.WorkflowRunID != nil {
		if resumeErr := ctrl.workflows.Resume(c.Request.Context(), *item.WorkflowRunID); resumeErr != nil && !errors.Is(resumeErr, sql.ErrNoRows) {
			WriteDomainError(c, resumeErr)
			return
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(item))
}

func (ctrl *AgentController) CancelInteraction(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req struct {
		ResumeToken string `json:"resume_token"`
	}
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	item, err := ctrl.approvals.GetInteraction(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if err := ctrl.approvals.CancelInteraction(c.Request.Context(), id, req.ResumeToken, interactionSubject(c)); err != nil {
		WriteDomainError(c, err)
		return
	}
	if item.WorkflowRunID != nil {
		if err := ctrl.workflows.Cancel(c.Request.Context(), *item.WorkflowRunID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			WriteDomainError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *AgentController) ListAIResources(c *gin.Context) {
	resourceType := c.Param("type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	page, pageSize = normalizedPagination(page, pageSize, 20)
	filters := map[string]string{}
	for key, values := range c.Request.URL.Query() {
		if key == "q" || key == "key" || key == "page" || key == "page_size" || len(values) == 0 {
			continue
		}
		filters[key] = values[0]
	}
	keys := c.QueryArray("key")
	items, total, err := ctrl.workflows.ListCatalog(c.Request.Context(), resourceType, domain.ResourceQuery{Query: c.Query("q"), Page: page, PageSize: pageSize, Filters: filters, Keys: keys})
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	unavailable := make([]string, 0)
	if len(keys) > 0 {
		resolved := make(map[string]bool, len(items))
		for _, item := range items {
			resolved[item.Key] = true
		}
		seen := map[string]bool{}
		for _, key := range keys {
			key = strings.TrimSpace(key)
			if key != "" && !seen[key] && !resolved[key] {
				seen[key] = true
				unavailable = append(unavailable, key)
			}
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": items, "total": total, "page": page, "page_size": pageSize, "unavailable_keys": unavailable}))
}

func (ctrl *AgentController) WorkflowMetrics(c *gin.Context) {
	result, err := ctrl.workflows.Metrics(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}
