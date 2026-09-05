package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	workflowservice "github.com/rushairer/blog-backend/internal/workflow"
	"github.com/rushairer/blog-backend/internal/workflowplan"
	"github.com/rushairer/gouno"
)

type draftAssistRequest struct {
	Task       string   `json:"task" binding:"required"`
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Content    string   `json:"content"`
	Prompt     string   `json:"prompt"`
	Categories []string `json:"categories"`
}

type DraftMetadataResult struct {
	Summary        string   `json:"summary,omitempty"`
	Tags           []string `json:"tags,omitempty"`
	Slug           string   `json:"slug,omitempty"`
	SeoTitle       string   `json:"seo_title,omitempty"`
	SeoDescription string   `json:"seo_description,omitempty"`
	Category       string   `json:"category,omitempty"`
	CoverAlt       string   `json:"cover_alt,omitempty"`
}

type workflowDraftRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

type workflowAgentSkillDraft struct {
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	SystemPrompt string          `json:"system_prompt"`
	Capabilities []string        `json:"capabilities"`
	InputSchema  json.RawMessage `json:"input_schema"`
}

func (ctrl *AgentController) DraftWorkflowAgents(c *gin.Context) {
	var req workflowDraftRequest
	if !bindWorkflowJSON(c, &req) {
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" || len([]rune(req.Prompt)) > 4000 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "workflow goal is required and must be at most 4000 characters"))
		return
	}
	profile, client, err := ctrl.svc.DefaultWritingClient(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	toolNames := make([]string, 0, len(ctrl.tools.Catalog()))
	allowed := map[string]bool{}
	for _, item := range ctrl.tools.Catalog() {
		toolNames = append(toolNames, item.Name)
		allowed[item.Name] = true
	}
	payload, _ := json.Marshal(map[string]any{"goal": req.Prompt, "registered_capabilities": toolNames})
	const toolName = "submit_agent_skill_drafts"
	schema := json.RawMessage(`{"type":"object","additionalProperties":false,"required":["drafts"],"properties":{"drafts":{"type":"array","minItems":1,"maxItems":3,"items":{"type":"object","additionalProperties":false,"required":["name","description","system_prompt","capabilities"],"properties":{"name":{"type":"string"},"description":{"type":"string"},"system_prompt":{"type":"string"},"capabilities":{"type":"array","items":{"type":"string"}},"input_schema":{"type":"object"}}}}}}`)
	result, err := client.Generate(c.Request.Context(), provider.Request{
		Instructions: "Design the smallest reusable Agent Skills missing for this workflow goal. Return 1-3 neutral, narrowly scoped Skill drafts. Use only registered capabilities. Never include credentials, arbitrary HTTP, direct publishing, deletion, or permission changes. Prefer proposal capabilities and human approval for content changes. Call the submission tool exactly once.",
		Messages:     []provider.Message{{Role: "user", Content: string(payload)}},
		Tools:        []provider.ToolDefinition{{Name: toolName, Description: "Submit reviewable Agent Skill drafts", Parameters: schema}},
		ToolChoice:   toolName, MaxTokens: 1600,
	})
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	raw := result.Text
	for _, call := range result.ToolCalls {
		if call.Name == toolName {
			raw = string(call.Arguments)
			break
		}
	}
	jsonBytes, ok := workflowplan.ExtractWorkflowDraftJSON(raw)
	var envelope struct {
		Drafts []workflowAgentSkillDraft `json:"drafts"`
	}
	if !ok || json.Unmarshal(jsonBytes, &envelope) != nil || len(envelope.Drafts) == 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "AI did not produce valid Agent Skill drafts"))
		return
	}
	clean := make([]workflowAgentSkillDraft, 0, len(envelope.Drafts))
	for _, draft := range envelope.Drafts {
		draft.Name, draft.Description, draft.SystemPrompt = strings.TrimSpace(draft.Name), strings.TrimSpace(draft.Description), strings.TrimSpace(draft.SystemPrompt)
		caps := []string{}
		seen := map[string]bool{}
		for _, capability := range draft.Capabilities {
			if allowed[capability] && !seen[capability] {
				seen[capability] = true
				caps = append(caps, capability)
			}
		}
		if draft.Name == "" || draft.SystemPrompt == "" || len(caps) == 0 {
			continue
		}
		draft.Capabilities = caps
		if len(draft.InputSchema) == 0 {
			draft.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":true}`)
		}
		clean = append(clean, draft)
	}
	if len(clean) == 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "AI drafts did not use registered capabilities"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"drafts": clean, "provider": profile.Name, "model": profile.Model}))
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
	agents, err := ctrl.svc.ListAgents(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	result, err := workflowplan.PlanWorkflow(
		c.Request.Context(),
		req.Prompt,
		profiles,
		agents,
		ctrl.tools.Catalog(),
		ctrl.workflows.ValidateDraft,
		ctrl.svc.ProviderClient,
	)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(result))
}

func (ctrl *AgentController) DraftAssist(c *gin.Context) {
	var req draftAssistRequest
	if err := bindAgentJSON(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	req.Task = strings.TrimSpace(req.Task)
	req.Title, req.Summary, req.Content, req.Prompt = strings.TrimSpace(req.Title), strings.TrimSpace(req.Summary), strings.TrimSpace(req.Content), strings.TrimSpace(req.Prompt)
	validTasks := map[string]bool{
		"title": true, "summary": true, "slug": true, "content": true,
		"tags": true, "seo": true, "alt": true, "category": true,
		"cover_prompt": true, "metadata_all": true,
	}
	if !validTasks[req.Task] || len([]rune(req.Content)) > 50000 || (req.Title == "" && req.Content == "" && req.Prompt == "") {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "task and article context or prompt are required"))
		return
	}
	if ctrl.generation == nil {
		c.JSON(http.StatusServiceUnavailable, gouno.NewErrorResponse(http.StatusServiceUnavailable, "AI generation service is unavailable"))
		return
	}
	generated, err := ctrl.generation.GenerateEditorText(c.Request.Context(), agentservice.EditorTextRequest{
		Task: req.Task, Title: req.Title, Summary: req.Summary, Content: req.Content, Prompt: req.Prompt, Categories: req.Categories,
	})
	if err != nil {
		// Preserve the historical editor contract for a missing writing default.
		if strings.Contains(err.Error(), "default writing Provider is required") {
			c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "an enabled default AI provider is required"))
			return
		}
		WriteDomainError(c, err)
		return
	}
	if req.Task == "content" {
		cleaned := cleanDraftAssistContent(generated.Text)
		if cleaned == "" {
			c.JSON(http.StatusBadGateway, gouno.NewErrorResponse(http.StatusBadGateway, "AI returned an empty content response"))
			return
		}
		c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"suggestions": []string{cleaned}, "provider": generated.Provider, "model": generated.Model}))
		return
	}
	if req.Task == "metadata_all" || req.Task == "seo" {
		metadata := extractStructuredMetadata(generated.Text)
		if metadata != nil {
			metaBytes, _ := json.Marshal(metadata)
			c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"suggestions": []string{string(metaBytes)}, "metadata": metadata, "provider": generated.Provider, "model": generated.Model}))
			return
		}
	}
	suggestions := extractDraftSuggestions(generated.Text)
	if len(suggestions) == 0 {
		c.JSON(http.StatusBadGateway, gouno.NewErrorResponse(http.StatusBadGateway, "AI returned an invalid suggestion response"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"suggestions": suggestions, "provider": generated.Provider, "model": generated.Model}))
}

var thinkRegex = regexp.MustCompile(`(?is)<(think|thought)>.*?</(think|thought)>`)

func stripThinkTags(raw string) string {
	return thinkRegex.ReplaceAllString(raw, "")
}

func cleanDraftAssistContent(raw string) string {
	text := strings.TrimSpace(stripThinkTags(raw))
	if strings.HasPrefix(text, "{") || strings.HasPrefix(text, "```json") {
		trimmed := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(text, "```json"), "```"))
		var jsonOutput struct {
			Suggestions []string `json:"suggestions"`
			Content     string   `json:"content"`
		}
		if err := json.Unmarshal([]byte(trimmed), &jsonOutput); err == nil {
			if len(jsonOutput.Suggestions) > 0 && strings.TrimSpace(jsonOutput.Suggestions[0]) != "" {
				text = jsonOutput.Suggestions[0]
			} else if strings.TrimSpace(jsonOutput.Content) != "" {
				text = jsonOutput.Content
			}
		} else {
			if idx := strings.Index(text, `"suggestions"`); idx != -1 {
				sub := text[idx:]
				if firstBracket := strings.Index(sub, `[`); firstBracket != -1 {
					sub = sub[firstBracket+1:]
					if firstQuote := strings.Index(sub, `"`); firstQuote != -1 {
						valStart := firstQuote + 1
						if lastQuote := strings.LastIndex(sub, `"`); lastQuote > valStart {
							candidate := sub[valStart:lastQuote]
							candidate = strings.ReplaceAll(candidate, `\n`, "\n")
							candidate = strings.ReplaceAll(candidate, `\"`, `"`)
							candidate = strings.ReplaceAll(candidate, `\t`, "\t")
							candidate = strings.ReplaceAll(candidate, `\\`, `\`)
							text = candidate
						}
					}
				}
			} else if idx := strings.Index(text, `"content"`); idx != -1 {
				sub := text[idx:]
				if firstQuote := strings.Index(sub, `":`); firstQuote != -1 {
					sub = sub[firstQuote+2:]
					if q1 := strings.Index(sub, `"`); q1 != -1 {
						valStart := q1 + 1
						if q2 := strings.LastIndex(sub, `"`); q2 > valStart {
							candidate := sub[valStart:q2]
							candidate = strings.ReplaceAll(candidate, `\n`, "\n")
							candidate = strings.ReplaceAll(candidate, `\"`, `"`)
							candidate = strings.ReplaceAll(candidate, `\t`, "\t")
							candidate = strings.ReplaceAll(candidate, `\\`, `\`)
							text = candidate
						}
					}
				}
			}
		}
	}

	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```markdown") && strings.HasSuffix(text, "```") {
		text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(text, "```markdown"), "```"))
	} else if strings.HasPrefix(text, "```md") && strings.HasSuffix(text, "```") {
		text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(text, "```md"), "```"))
	} else if strings.HasPrefix(text, "```") && strings.HasSuffix(text, "```") {
		text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(text, "```"), "```"))
	}

	return strings.TrimSpace(text)
}

func extractStructuredMetadata(raw string) *DraftMetadataResult {
	text := strings.TrimSpace(stripThinkTags(raw))
	if text == "" {
		return nil
	}
	trimmed := text
	if idx := strings.Index(trimmed, "```"); idx != -1 {
		endIdx := strings.LastIndex(trimmed, "```")
		if endIdx > idx {
			sub := trimmed[idx+3 : endIdx]
			if strings.HasPrefix(strings.ToLower(sub), "json") {
				sub = sub[4:]
			}
			trimmed = strings.TrimSpace(sub)
		}
	}

	// 1. Try multi-tag unmarshaling (supports snake_case and camelCase simultaneously)
	var multi struct {
		Summary       string   `json:"summary"`
		Tags          []string `json:"tags"`
		Slug          string   `json:"slug"`
		SlugName      string   `json:"slug_name"`
		SeoTitle      string   `json:"seo_title"`
		SeoTitleCamel string   `json:"seoTitle"`
		SeoDesc       string   `json:"seo_description"`
		SeoDescCamel  string   `json:"seoDescription"`
		Category      string   `json:"category"`
		CoverAlt      string   `json:"cover_alt"`
		CoverAltCamel string   `json:"coverAlt"`
	}
	if err := json.Unmarshal([]byte(trimmed), &multi); err == nil {
		st := multi.SeoTitle
		if st == "" {
			st = multi.SeoTitleCamel
		}
		sd := multi.SeoDesc
		if sd == "" {
			sd = multi.SeoDescCamel
		}
		sl := multi.Slug
		if sl == "" {
			sl = multi.SlugName
		}
		ca := multi.CoverAlt
		if ca == "" {
			ca = multi.CoverAltCamel
		}
		if multi.Summary != "" || len(multi.Tags) > 0 || sl != "" || st != "" || sd != "" || multi.Category != "" || ca != "" {
			return &DraftMetadataResult{
				Summary:        multi.Summary,
				Tags:           multi.Tags,
				Slug:           sl,
				SeoTitle:       st,
				SeoDescription: sd,
				Category:       multi.Category,
				CoverAlt:       ca,
			}
		}
	}

	// 2. Substring between outermost braces {...}
	if start := strings.Index(text, "{"); start != -1 {
		if end := strings.LastIndex(text, "}"); end > start {
			jsonSub := text[start : end+1]
			if err := json.Unmarshal([]byte(jsonSub), &multi); err == nil {
				st := multi.SeoTitle
				if st == "" {
					st = multi.SeoTitleCamel
				}
				sd := multi.SeoDesc
				if sd == "" {
					sd = multi.SeoDescCamel
				}
				sl := multi.Slug
				if sl == "" {
					sl = multi.SlugName
				}
				ca := multi.CoverAlt
				if ca == "" {
					ca = multi.CoverAltCamel
				}
				if multi.Summary != "" || len(multi.Tags) > 0 || sl != "" || st != "" || sd != "" || multi.Category != "" || ca != "" {
					return &DraftMetadataResult{
						Summary:        multi.Summary,
						Tags:           multi.Tags,
						Slug:           sl,
						SeoTitle:       st,
						SeoDescription: sd,
						Category:       multi.Category,
						CoverAlt:       ca,
					}
				}
			}
		}
	}

	// 4. Robust Regex extraction for truncated or imperfect LLM outputs
	extractField := func(keys ...string) string {
		for _, k := range keys {
			re := regexp.MustCompile(`(?i)"` + regexp.QuoteMeta(k) + `"\s*:\s*"((?:\\.|[^"\\])*)"`)
			if m := re.FindStringSubmatch(text); len(m) > 1 {
				val := m[1]
				val = strings.ReplaceAll(val, `\n`, "\n")
				val = strings.ReplaceAll(val, `\"`, `"`)
				val = strings.ReplaceAll(val, `\t`, "\t")
				val = strings.ReplaceAll(val, `\\`, `\`)
				val = strings.TrimSpace(val)
				if val != "" {
					return val
				}
			}
		}
		return ""
	}

	seoTitle := extractField("seo_title", "seoTitle", "title")
	seoDescription := extractField("seo_description", "seoDescription", "description", "summary")
	slug := extractField("slug", "slug_name", "url_slug")
	summary := extractField("summary", "abstract")
	category := extractField("category", "category_name")
	coverAlt := extractField("cover_alt", "coverAlt", "alt")

	// Extract tags array via regex
	var tags []string
	tagRe := regexp.MustCompile(`(?i)"tags"\s*:\s*\[([^\]]*)\]`)
	if tagMatch := tagRe.FindStringSubmatch(text); len(tagMatch) > 1 {
		inner := tagMatch[1]
		itemRe := regexp.MustCompile(`"((?:\\.|[^"\\])*)"`)
		for _, im := range itemRe.FindAllStringSubmatch(inner, -1) {
			if len(im) > 1 && strings.TrimSpace(im[1]) != "" {
				tags = append(tags, strings.TrimSpace(im[1]))
			}
		}
	}

	if seoTitle != "" || seoDescription != "" || slug != "" || summary != "" || len(tags) > 0 || category != "" || coverAlt != "" {
		return &DraftMetadataResult{
			Summary:        summary,
			Tags:           tags,
			Slug:           slug,
			SeoTitle:       seoTitle,
			SeoDescription: seoDescription,
			Category:       category,
			CoverAlt:       coverAlt,
		}
	}

	return nil
}

func extractDraftSuggestions(raw string) []string {
	text := strings.TrimSpace(stripThinkTags(raw))
	if text == "" {
		return nil
	}

	trimmed := text
	if idx := strings.Index(trimmed, "```"); idx != -1 {
		endIdx := strings.LastIndex(trimmed, "```")
		if endIdx > idx {
			sub := trimmed[idx+3 : endIdx]
			if strings.HasPrefix(strings.ToLower(sub), "json") {
				sub = sub[4:]
			}
			trimmed = strings.TrimSpace(sub)
		}
	}

	// 1. Try standard JSON struct
	var obj struct {
		Suggestions []string `json:"suggestions"`
		Candidates  []string `json:"candidates"`
		Summary     string   `json:"summary"`
		Title       string   `json:"title"`
	}
	if err := json.Unmarshal([]byte(trimmed), &obj); err == nil {
		list := obj.Suggestions
		if len(list) == 0 {
			list = obj.Candidates
		}
		if len(list) == 0 && obj.Summary != "" {
			list = []string{obj.Summary}
		}
		if len(list) == 0 && obj.Title != "" {
			list = []string{obj.Title}
		}
		res := filterUniqueSuggestions(list)
		if len(res) > 0 {
			return res
		}
	}

	// 2. Try JSON array of strings
	var arr []string
	if err := json.Unmarshal([]byte(trimmed), &arr); err == nil {
		res := filterUniqueSuggestions(arr)
		if len(res) > 0 {
			return res
		}
	}

	// 3. Try regex extracting individual quoted strings in array "[ ... ]" or after "suggestions"
	if start := strings.Index(text, `[`); start != -1 {
		arrayContent := text[start+1:]
		if end := strings.LastIndex(arrayContent, `]`); end != -1 {
			arrayContent = arrayContent[:end]
		}
		re := regexp.MustCompile(`"((?:\\.|[^"\\])*)"`)
		matches := re.FindAllStringSubmatch(arrayContent, -1)
		var innerArr []string
		for _, m := range matches {
			if len(m) > 1 {
				val := m[1]
				val = strings.ReplaceAll(val, `\n`, "\n")
				val = strings.ReplaceAll(val, `\"`, `"`)
				val = strings.ReplaceAll(val, `\t`, "\t")
				val = strings.ReplaceAll(val, `\\`, `\`)
				val = strings.TrimSpace(val)
				if val != "" && val != "suggestions" && val != "candidates" && val != "title" && val != "summary" {
					innerArr = append(innerArr, val)
				}
			}
		}
		res := filterUniqueSuggestions(innerArr)
		if len(res) > 0 {
			return res
		}
	}

	// 4. Try parsing line by line (e.g. "1. xxx", "- xxx", "• xxx")
	lines := strings.Split(text, "\n")
	var candidates []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "```") || strings.HasPrefix(line, "{") || strings.HasPrefix(line, "}") || strings.HasPrefix(line, "[") || strings.HasPrefix(line, "]") {
			continue
		}
		if strings.HasPrefix(line, `"suggestions"`) || strings.HasPrefix(line, `"title"`) || strings.HasPrefix(line, `"summary"`) {
			continue
		}
		line = strings.TrimLeft(line, "-*•0123456789.、 \t\"'")
		line = strings.TrimRight(line, "\"' \t,")
		line = strings.TrimSpace(line)
		if line != "" {
			candidates = append(candidates, line)
		}
	}
	res := filterUniqueSuggestions(candidates)
	if len(res) > 0 {
		return res
	}

	// 5. Fallback: Split by `","` if multiple strings exist
	if strings.Contains(text, `","`) {
		parts := strings.Split(text, `","`)
		var items []string
		for _, p := range parts {
			p = strings.TrimLeft(p, `{"[ \t\r\n"`)
			p = strings.TrimRight(p, `"}] \t\r\n,`)
			p = strings.TrimSpace(p)
			if p != "" {
				items = append(items, p)
			}
		}
		res := filterUniqueSuggestions(items)
		if len(res) > 0 {
			return res
		}
	}

	// 6. Fallback: single cleaned text if not a JSON array structure
	if !strings.Contains(text, `"suggestions"`) && !strings.HasPrefix(text, "{") && !strings.HasPrefix(text, "[") {
		cleaned := cleanDraftAssistContent(text)
		if cleaned != "" {
			return []string{cleaned}
		}
	}

	return nil
}

func filterUniqueSuggestions(items []string) []string {
	seen := map[string]bool{}
	res := make([]string, 0, min(len(items), 5))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" && !seen[item] {
			seen[item] = true
			res = append(res, item)
			if len(res) == 5 {
				break
			}
		}
	}
	return res
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
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWorkflowJSONBody)
	if err := bindHumanTemplateJSON(c, &value); err != nil {
		if !c.IsAborted() {
			status := http.StatusBadRequest
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				status = http.StatusRequestEntityTooLarge
			}
			c.JSON(status, gouno.NewErrorResponse(status, err.Error()))
		}
		return
	}
	value.ID = id
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
	if _, ok := interactionPrincipalID(c); !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	if err := ctrl.workflows.SetEnabled(c.Request.Context(), id, enabled); err != nil {
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
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	run, err := ctrl.workflows.RetryFailed(c.Request.Context(), id, req.StepID, req.Iterations, &principalID)
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
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	queued, err := ctrl.workflows.EmitEvent(c.Request.Context(), req.EventKey, req.Event, req.Payload, &principalID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gouno.NewSuccessResponse(gin.H{"accepted": true, "queued": queued}))
}

var idempotencyKeyRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-\.]{1,128}$`)

func validateIdempotencyKey(key string) bool {
	return idempotencyKeyRegex.MatchString(key)
}

func parseWebhookHeaders(sigHeader, tsHeader string) (int64, string, error) {
	sigHeader = strings.TrimSpace(sigHeader)
	tsHeader = strings.TrimSpace(tsHeader)

	var timestamp int64
	var signatureHex string

	if strings.Contains(sigHeader, "=") && (strings.Contains(sigHeader, "t=") || strings.Contains(sigHeader, "v1=")) {
		parts := strings.Split(sigHeader, ",")
		for _, part := range parts {
			kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
			if len(kv) == 2 {
				k, v := strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1])
				if k == "t" {
					t, err := strconv.ParseInt(v, 10, 64)
					if err == nil {
						timestamp = t
					}
				} else if k == "v1" {
					signatureHex = v
				}
			}
		}
	} else {
		signatureHex = strings.TrimPrefix(sigHeader, "sha256=")
		signatureHex = strings.TrimPrefix(signatureHex, "v1=")
	}

	if timestamp == 0 && tsHeader != "" {
		t, err := strconv.ParseInt(tsHeader, 10, 64)
		if err == nil {
			timestamp = t
		}
	}

	if timestamp == 0 {
		return 0, "", fmt.Errorf("missing or invalid webhook timestamp")
	}
	if signatureHex == "" {
		return 0, "", fmt.Errorf("missing webhook signature")
	}

	return timestamp, signatureHex, nil
}

func canonicalWebhookPayload(method, event string, timestamp int64, idempotencyKey string, bodyDigest string) string {
	return fmt.Sprintf("v1\n%s\n%s\n%d\n%s\n%s",
		strings.ToUpper(strings.TrimSpace(method)),
		strings.ToLower(strings.TrimSpace(event)),
		timestamp,
		strings.TrimSpace(idempotencyKey),
		bodyDigest,
	)
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

	eventType := strings.TrimSpace(c.Param("event"))
	if eventType == "" || len(eventType) > 80 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid webhook event"))
		return
	}

	eventKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if eventKey == "" {
		eventKey = strings.TrimSpace(c.GetHeader("X-Event-ID"))
	}
	if eventKey == "" || !validateIdempotencyKey(eventKey) {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "missing or invalid Idempotency-Key"))
		return
	}

	timestamp, providedSigHex, err := parseWebhookHeaders(c.GetHeader("X-Gouno-Signature"), c.GetHeader("X-Gouno-Timestamp"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	now := time.Now().Unix()
	const maxSkewSeconds = 300 // 5 minutes
	if timestamp < now-maxSkewSeconds {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "webhook timestamp expired"))
		return
	}
	if timestamp > now+maxSkewSeconds {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "webhook timestamp in the future"))
		return
	}

	bodySum := sha256.Sum256(body)
	bodyDigest := hex.EncodeToString(bodySum[:])

	canonical := canonicalWebhookPayload(c.Request.Method, eventType, timestamp, eventKey, bodyDigest)
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write([]byte(canonical))
	expected := hex.EncodeToString(digest.Sum(nil))

	providedBytes, decodeErr := hex.DecodeString(providedSigHex)
	expectedBytes, _ := hex.DecodeString(expected)
	if decodeErr != nil || len(providedBytes) != 32 || !hmac.Equal(providedBytes, expectedBytes) {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid webhook signature"))
		return
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
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	if !exists || !ok || principalID <= 0 {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	run, err := ctrl.workflows.Queue(c.Request.Context(), id, dryRun, req.Input, &principalID)
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

func interactionPrincipalID(c *gin.Context) (int64, bool) {
	raw, exists := c.Get("blog_principal_id")
	principalID, ok := raw.(int64)
	return principalID, exists && ok && principalID > 0
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
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	item, err := ctrl.approvals.ResolveInteraction(c.Request.Context(), id, req.ResumeToken, req.Response, principalID)
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
	principalID, ok := interactionPrincipalID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "authenticated local principal is required"))
		return
	}
	if err := ctrl.approvals.CancelInteraction(c.Request.Context(), id, req.ResumeToken, principalID); err != nil {
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
