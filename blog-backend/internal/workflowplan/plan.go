package workflowplan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/tool"
)

var (
	ErrDefaultModelRequired = errors.New("an enabled default writing model is required")
	ErrAgentSkillRequired   = errors.New("create an enabled Agent with a saved Skill before planning a workflow")
	ErrGoalRequired         = errors.New("workflow goal is required and must be at most 4000 characters")
	ErrPlannerContract      = errors.New("planner could not produce a valid typed workflow")
)

const PlannerProtocolVersion = "workflow-intent/v2"

type WorkflowIntent struct {
	Version          string            `json:"version"`
	Status           string            `json:"status"`
	ResourceTypes    []string          `json:"resource_types"`
	ResourceSource   string            `json:"resource_source"`
	Domain           string            `json:"domain"`
	Action           string            `json:"action"`
	InputFields      []string          `json:"input_fields"`
	OutputType       string            `json:"output_type"`
	RequiresApproval bool              `json:"requires_approval"`
	RequiresImage    bool              `json:"requires_image_generation"`
	ExternalDelivery bool              `json:"external_delivery"`
	RuntimeMode      string            `json:"runtime_mode"`
	AmbiguityReason  string            `json:"ambiguity_reason,omitempty"`
	Trigger          IntentTrigger     `json:"trigger"`
	Inputs           []IntentInput     `json:"inputs"`
	Operations       []IntentOperation `json:"operations"`
}

type IntentTrigger struct {
	Type           string `json:"type"`
	CronExpression string `json:"cron_expression,omitempty"`
	Timezone       string `json:"timezone,omitempty"`
}

type IntentInput struct {
	Name   string `json:"name"`
	Source string `json:"source"` // user, generated, or fixed
	Type   string `json:"type,omitempty"`
}

type IntentOperation struct {
	StepID               string   `json:"step_id"`
	Purpose              string   `json:"purpose"`
	ResourceMode         string   `json:"resource_mode"` // create, existing, or none
	RequiredCapabilities []string `json:"required_capabilities"`
	DependsOn            []string `json:"depends_on,omitempty"`
}

type plannerEnvelope struct {
	Intent   WorkflowIntent  `json:"intent"`
	Workflow domain.Workflow `json:"workflow"`
}

// Template is only the execution contract for workflows already persisted by
// bootstrap or migrations. New workflows are planned exclusively through the
// typed workflow-intent/v2 contract below.
type Template struct {
	Key              string
	Tool             string
	RequiresApproval bool
	RequiresImage    bool
}

// persistedTemplates are the stable keys used by migration/bootstrap starter
// Workflows. They are ordinary versioned Workflows, but Preflight still needs
// their capability and approval contract so a seeded row cannot bypass the
// same checks as a planner-created Workflow.
var persistedTemplates = []Template{
	{Key: "daily_news", Tool: "rss.fetch"},
	{Key: "weekly_operations", Tool: "analytics.get_summary"},
	{Key: "stale_content_refresh", Tool: "content.list_stale_posts", RequiresApproval: true},
	{Key: "low_engagement", Tool: "analytics.list_low_engagement_posts"},
	{Key: "selected_pre_publish_review", Tool: "content.audit_post", RequiresApproval: true},
	{Key: "selected_internal_linking", Tool: "content.find_internal_links", RequiresApproval: true},
	{Key: "selected_distribution", Tool: "content.propose_distribution_draft", RequiresApproval: true},
	{Key: "selected_article_image_generation", Tool: "media.create_image_task", RequiresImage: true},
	{Key: "selected_comment_replies", Tool: "comments.propose_reply", RequiresApproval: true},
	{Key: "selected_media_review", Tool: "media.get_asset"},
	{Key: "selected_page_review", Tool: "content.audit_page", RequiresApproval: true},
	{Key: "selected_operations_deep_dive", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "selected_taxonomy_review", Tool: "content.list_categories"},
	{Key: "selected_mixed_review", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "scheduled_stale_resource_review", Tool: "content.list_stale_posts", RequiresApproval: true},
	{Key: "scheduled_post_publish_review", Tool: "content.audit_post", RequiresApproval: true},
	{Key: "scheduled_page_review", Tool: "content.audit_page", RequiresApproval: true},
	{Key: "scheduled_reported_comment_review", Tool: "comments.propose_reply", RequiresApproval: true},
	{Key: "scheduled_missing_alt_review", Tool: "media.get_asset"},
}

// TemplateByKey resolves the execution contract for persisted starter
// workflows so runtime preflight remains compatible with existing rows.
func TemplateByKey(key string) (*Template, bool) {
	key = strings.TrimSpace(key)
	for index := range persistedTemplates {
		if persistedTemplates[index].Key == key {
			value := persistedTemplates[index]
			return &value, true
		}
	}
	return nil, false
}

func PersistedTemplateKeys() []string {
	keys := make([]string, 0, len(persistedTemplates))
	for _, template := range persistedTemplates {
		keys = append(keys, template.Key)
	}
	return keys
}

func ExtractWorkflowDraftJSON(value string) ([]byte, bool) {
	value = strings.TrimSpace(value)
	if json.Valid([]byte(value)) {
		return []byte(value), true
	}
	start := strings.IndexByte(value, '{')
	if start < 0 {
		return nil, false
	}
	depth := 0
	inString, escaped := false, false
	for index := start; index < len(value); index++ {
		char := value[index]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if char == '\\' {
				escaped = true
			} else if char == '"' {
				inString = false
			}
			continue
		}
		switch char {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				candidate := []byte(value[start : index+1])
				return candidate, json.Valid(candidate)
			}
		}
	}
	return nil, false
}

func WorkflowDraftAgentIDs(steps []domain.WorkflowStep) []int64 {
	ids := []int64{}
	for _, step := range steps {
		if step.Type == "model" && step.AgentID > 0 {
			ids = append(ids, step.AgentID)
		}
		ids = append(ids, WorkflowDraftAgentIDs(step.Steps)...)
	}
	return ids
}

const WorkflowPlannerPrompt = `You are workflow-planner/v7 for a blog administration product. Return exactly one JSON object and nothing else: no Markdown, code fence, commentary, or prose.
Convert the user's complete goal into a typed intent and a small, safe, executable workflow. Do not classify by isolated keywords: preserve the relationships between trigger, newly created resources, existing resources, downstream artifacts, and approval boundaries.

Required top-level shape:
{"intent":{"version":"workflow-intent/v2","status":"ready","resource_types":[],"resource_source":"new|existing|mixed|none","domain":"...","action":"...","input_fields":[],"output_type":"...","requires_approval":true|false,"requires_image_generation":true|false,"external_delivery":false,"runtime_mode":"manual|cron","trigger":{"type":"manual|cron","cron_expression":"...","timezone":"Asia/Shanghai"},"inputs":[{"name":"...","source":"user|generated|fixed","type":"..."}],"operations":[{"step_id":"...","purpose":"...","resource_mode":"create|existing|none","required_capabilities":["registered.tool"],"depends_on":["prior_step_id"]}]},"workflow":{"name":"...","description":"...","cron_expression":"...","timezone":"Asia/Shanghai","input_schema":{},"steps":[]}}

The intent is a semantic contract. Every model step must have one matching intent.operations entry. required_capabilities must use only names from available_tools, and the chosen agent_id must own every listed capability. Only source="user" intent inputs belong in workflow.input_schema. A generated output from an earlier operation is never a top-level user input or resource picker.

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
- Existing resources explicitly chosen at run time use the appropriate resource ID field and x-gouno-resource widget. Resources created by an earlier operation must flow through /steps/<step_id>, never through input_schema.
- Translate explicit recurring language into a five-field cron_expression and preserve the requested timezone. An explicit schedule must never become manual.
- Use an approval_gate after an operation whose result must be approved before dependent operations may run. The gate is a real pause boundary.
- Choose Agents by the operation's required capabilities and purpose, never by list order or a loosely related name.
- All JSON Pointer values must start with a leading slash '/'.
- Keep at most 5 top-level steps. Do not invent image, tool, connector, HTTP, publish, or other step types. Do not create, enable, run, publish, or modify anything.`

const WorkflowPlannerCorrectionPrompt = `The previous response violated the typed workflow contract. Return one corrected JSON object with exactly the top-level keys intent and workflow. Preserve the user's complete goal. Fix every supplied validation_error. intent.trigger and workflow.cron_expression must agree; only intent.inputs with source user may appear in input_schema; generated resources must flow from prior step outputs; every model step needs an intent.operations entry; every required capability must be registered and authorized by that step's integer agent_id; approval_gate is a real pause before dependent work. Steps may only be resource_query, for_each, model, approval_gate, and output. Never invent tools, step types, credentials, publishing, or external delivery.`

type WorkflowDraftResult struct {
	Workflow       domain.Workflow  `json:"workflow"`
	Provider       string           `json:"provider"`
	Model          string           `json:"model"`
	PlannerVersion string           `json:"planner_version"`
	PlannerWarning string           `json:"planner_warning"`
	SelectedAgents []map[string]any `json:"selected_agents"`
	Intent         WorkflowIntent   `json:"intent"`
	Readiness      map[string]any   `json:"readiness"`
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func resolveAgentProfile(agent *domain.Agent, profiles []*domain.ProviderProfile) *domain.ProviderProfile {
	if agent.ProviderProfile != nil && agent.ProviderProfile.Enabled {
		return agent.ProviderProfile
	}
	if agent.ProviderProfileID != nil && *agent.ProviderProfileID > 0 {
		for _, profile := range profiles {
			if profile.ID == *agent.ProviderProfileID && profile.Enabled {
				return profile
			}
		}
	}
	for _, profile := range profiles {
		if profile.Enabled && profile.IsDefaultWriting {
			return profile
		}
	}
	return nil
}

func validatePlannerEnvelope(envelope *plannerEnvelope, agents []*domain.Agent, catalog []tool.CatalogItem) []string {
	errors := []string{}
	if envelope.Intent.Version != PlannerProtocolVersion || envelope.Intent.Status != "ready" {
		errors = append(errors, "intent must be ready and use workflow-intent/v2")
	}
	trigger := envelope.Intent.Trigger
	switch trigger.Type {
	case "cron":
		if strings.TrimSpace(trigger.CronExpression) == "" {
			errors = append(errors, "cron intent requires trigger.cron_expression")
		} else if envelope.Workflow.CronExpression == nil || strings.TrimSpace(*envelope.Workflow.CronExpression) != strings.TrimSpace(trigger.CronExpression) {
			errors = append(errors, "intent trigger and workflow cron_expression must match")
		}
	case "manual":
		if envelope.Workflow.CronExpression != nil && strings.TrimSpace(*envelope.Workflow.CronExpression) != "" {
			errors = append(errors, "manual intent must not define workflow cron_expression")
		}
	default:
		errors = append(errors, "intent.trigger.type must be manual or cron")
	}
	var schema struct {
		Type                 string                     `json:"type"`
		AdditionalProperties *bool                      `json:"additionalProperties"`
		Properties           map[string]json.RawMessage `json:"properties"`
	}
	if json.Unmarshal(envelope.Workflow.InputSchema, &schema) != nil || schema.Type != "object" || schema.AdditionalProperties == nil || *schema.AdditionalProperties {
		errors = append(errors, "workflow.input_schema must be a closed object schema")
	}
	declaredInputs := map[string]string{}
	for _, input := range envelope.Intent.Inputs {
		if strings.TrimSpace(input.Name) == "" || (input.Source != "user" && input.Source != "generated" && input.Source != "fixed") {
			errors = append(errors, "intent inputs require a name and source user, generated, or fixed")
			continue
		}
		declaredInputs[input.Name] = input.Source
		_, inSchema := schema.Properties[input.Name]
		if input.Source == "user" && !inSchema {
			errors = append(errors, fmt.Sprintf("user input %q is missing from input_schema", input.Name))
		}
		if input.Source != "user" && inSchema {
			errors = append(errors, fmt.Sprintf("non-user input %q must not appear in input_schema", input.Name))
		}
	}
	for name := range schema.Properties {
		if declaredInputs[name] != "user" {
			errors = append(errors, fmt.Sprintf("input_schema field %q is not declared as a user input", name))
		}
	}
	registeredTools := map[string]bool{}
	for _, item := range catalog {
		registeredTools[item.Name] = true
	}
	agentsByID := map[int64]*domain.Agent{}
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil && agent.Skill != nil {
			agentsByID[agent.ID] = agent
		}
	}
	modelSteps := map[string]domain.WorkflowStep{}
	var collectModels func([]domain.WorkflowStep)
	collectModels = func(steps []domain.WorkflowStep) {
		for _, step := range steps {
			if step.Type == "model" {
				modelSteps[step.ID] = step
			}
			collectModels(step.Steps)
		}
	}
	collectModels(envelope.Workflow.Steps)
	operations := map[string]bool{}
	for _, operation := range envelope.Intent.Operations {
		step, ok := modelSteps[operation.StepID]
		if !ok {
			errors = append(errors, fmt.Sprintf("operation %q does not reference a model step", operation.StepID))
			continue
		}
		operations[operation.StepID] = true
		agent := agentsByID[step.AgentID]
		if agent == nil {
			errors = append(errors, fmt.Sprintf("step %q does not use an enabled Agent with a locked Skill", step.ID))
			continue
		}
		for _, capability := range operation.RequiredCapabilities {
			if !registeredTools[capability] {
				errors = append(errors, fmt.Sprintf("operation %q requires unregistered capability %q", operation.StepID, capability))
			} else if !contains(agent.Skill.Capabilities, capability) {
				errors = append(errors, fmt.Sprintf("Agent %d for step %q lacks capability %q", agent.ID, operation.StepID, capability))
			}
		}
		for _, dependency := range operation.DependsOn {
			if _, ok := modelSteps[dependency]; !ok {
				errors = append(errors, fmt.Sprintf("operation %q depends on unknown model step %q", operation.StepID, dependency))
			}
		}
	}
	for stepID := range modelSteps {
		if !operations[stepID] {
			errors = append(errors, fmt.Sprintf("model step %q has no typed intent operation", stepID))
		}
	}
	if envelope.Intent.RequiresApproval {
		hasGate := false
		for _, step := range envelope.Workflow.Steps {
			if step.Type == "approval_gate" {
				hasGate = true
				break
			}
		}
		if !hasGate {
			errors = append(errors, "intent requires approval but workflow has no approval_gate")
		}
	}
	return errors
}

func PlanWorkflow(
	ctx context.Context,
	prompt string,
	profiles []*domain.ProviderProfile,
	agents []*domain.Agent,
	toolsCatalog []tool.CatalogItem,
	validateDraft func(*domain.Workflow) error,
	clientProvider func(ctx context.Context, providerID int64) (provider.Provider, error),
) (*WorkflowDraftResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" || len([]rune(prompt)) > 4000 {
		return nil, ErrGoalRequired
	}
	var selected *domain.ProviderProfile
	for _, profile := range profiles {
		if profile.Enabled && profile.IsDefaultWriting {
			selected = profile
			break
		}
	}
	if selected == nil {
		return nil, ErrDefaultModelRequired
	}
	available := make([]map[string]any, 0, len(agents))
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil {
			item := map[string]any{"id": agent.ID, "name": agent.Name, "description": agent.Description, "skill_version_id": agent.SkillVersionID}
			if agent.Skill != nil {
				item["execution_mode"] = agent.Skill.ExecutionMode
				item["capabilities"] = agent.Skill.Capabilities
			}
			available = append(available, item)
		}
	}
	if len(available) == 0 {
		return nil, ErrAgentSkillRequired
	}
	for _, agent := range agents {
		if agent.ProviderProfile == nil {
			agent.ProviderProfile = resolveAgentProfile(agent, profiles)
		}
	}
	client, err := clientProvider(ctx, selected.ID)
	if err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]any{
		"goal":             prompt,
		"available_agents": available,
		"available_tools":  toolsCatalog,
	})
	maxTokens := selected.MaxOutputTokens
	if maxTokens < 3000 {
		maxTokens = 3000
	}
	result, err := client.Generate(ctx, provider.Request{
		Instructions: WorkflowPlannerPrompt,
		Messages:     []provider.Message{{Role: "user", Content: string(payload)}},
		MaxTokens:    maxTokens,
	})
	if err != nil {
		return nil, err
	}
	var envelope plannerEnvelope
	warning := ""
	decodeDraft := func(text string) ([]string, bool) {
		draftJSON, validJSON := ExtractWorkflowDraftJSON(text)
		if !validJSON || json.Unmarshal(draftJSON, &envelope) != nil {
			return []string{"response must be valid JSON with top-level intent and workflow"}, false
		}
		validationErrors := validatePlannerEnvelope(&envelope, agents, toolsCatalog)
		return validationErrors, len(validationErrors) == 0
	}
	validationErrors, validDraft := decodeDraft(result.Text)
	if !validDraft {
		correctionPayload, _ := json.Marshal(map[string]any{"goal": prompt, "available_agents": available, "available_tools": toolsCatalog, "validation_errors": validationErrors, "previous_response": result.Text})
		correction, correctionErr := client.Generate(ctx, provider.Request{
			Instructions: WorkflowPlannerCorrectionPrompt,
			Messages:     []provider.Message{{Role: "user", Content: string(correctionPayload)}},
			MaxTokens:    maxTokens,
		})
		if correctionErr == nil {
			validationErrors, validDraft = decodeDraft(correction.Text)
		}
	}
	if !validDraft {
		return nil, fmt.Errorf("%w: %s", ErrPlannerContract, strings.Join(validationErrors, "; "))
	}
	draft := envelope.Workflow
	draft.Enabled = false
	if err := validateDraft(&draft); err != nil {
		return nil, err
	}
	availableByID := make(map[int64]*domain.Agent, len(agents))
	for _, agent := range agents {
		if agent.Enabled && agent.SkillVersionID != nil {
			availableByID[agent.ID] = agent
		}
	}
	selectedAgents := []map[string]any{}
	for _, id := range WorkflowDraftAgentIDs(draft.Steps) {
		agent, ok := availableByID[id]
		if !ok {
			continue
		}
		selection := map[string]any{"id": agent.ID, "name": agent.Name, "status": "ready"}
		if agent.Skill != nil {
			selection["skill_name"] = agent.Skill.Name
			selection["capabilities"] = agent.Skill.Capabilities
		}
		selectedAgents = append(selectedAgents, selection)
	}
	return &WorkflowDraftResult{
		Workflow:       draft,
		Provider:       selected.Name,
		Model:          selected.Model,
		PlannerVersion: "workflow-planner/v7",
		PlannerWarning: warning,
		SelectedAgents: selectedAgents,
		Intent:         envelope.Intent,
		Readiness:      map[string]any{"status": "ready", "message": "Provider, Agent, and Skill bindings were verified for this draft."},
	}, nil
}
