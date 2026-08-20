package workflowplan

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
)

const ProtocolVersion = "workflow-intent/v1"

type WorkflowIntent struct {
	Version          string   `json:"version"`
	Status           string   `json:"status"`
	ResourceTypes    []string `json:"resource_types"`
	ResourceSource   string   `json:"resource_source"`
	Domain           string   `json:"domain"`
	Action           string   `json:"action"`
	InputFields      []string `json:"input_fields"`
	OutputType       string   `json:"output_type"`
	RequiresApproval bool     `json:"requires_approval"`
	RequiresImage    bool     `json:"requires_image_generation"`
	ExternalDelivery bool     `json:"external_delivery"`
	RuntimeMode      string   `json:"runtime_mode"`
	AmbiguityReason  string   `json:"ambiguity_reason,omitempty"`
}

type Capability struct {
	Name             string
	Domain           string
	Actions          []string
	Tools            []string
	ResourceTypes    []string
	OutputType       string
	Risk             domain.ToolRiskLevel
	RequiresApproval bool
	ExternalDelivery bool
	ProviderPurpose  string
}

type Template struct {
	Key              string
	Name             string
	Domain           string
	Action           string
	ResourceTypes    []string
	OutputType       string
	Tool             string
	RequiresApproval bool
	RequiresImage    bool
	InputFormat      string
}

type MatchResult struct {
	Status             string   `json:"status"`
	Matches            []string `json:"matches"`
	Missing            []string `json:"missing"`
	Warnings           []string `json:"warnings"`
	SuggestedTemplates []string `json:"suggested_templates"`
}

type Plan struct {
	Intent   WorkflowIntent `json:"intent"`
	Template struct {
		Status string `json:"status"`
		Key    string `json:"key,omitempty"`
		Name   string `json:"name,omitempty"`
	} `json:"template"`
	Match    MatchResult     `json:"match"`
	Workflow domain.Workflow `json:"workflow"`
}

var templates = []Template{
	{Key: "article_image_brief", Name: "文章配图 Brief", Domain: "distribution", Action: "image_brief", ResourceTypes: []string{"post"}, OutputType: "image_brief", Tool: "content.propose_distribution_draft", RequiresApproval: true, InputFormat: "image_brief"},
	{Key: "article_image_generation", Name: "生成封面/文配图", Domain: "media", Action: "generate_image", ResourceTypes: []string{"post"}, OutputType: "media_asset", Tool: "media.create_image_task", RequiresImage: true, InputFormat: "image_brief"},
	{Key: "content_distribution_social", Name: "社交分发草稿", Domain: "distribution", Action: "social", ResourceTypes: []string{"post"}, OutputType: "social_draft", Tool: "content.propose_distribution_draft", RequiresApproval: true, InputFormat: "social"},
	{Key: "content_distribution_newsletter", Name: "Newsletter 草稿", Domain: "distribution", Action: "newsletter", ResourceTypes: []string{"post"}, OutputType: "newsletter_draft", Tool: "content.propose_distribution_draft", RequiresApproval: true, InputFormat: "newsletter"},
	{Key: "content_distribution_faq", Name: "FAQ 草稿", Domain: "distribution", Action: "faq", ResourceTypes: []string{"post"}, OutputType: "faq_draft", Tool: "content.propose_distribution_draft", RequiresApproval: true, InputFormat: "faq"},
	{Key: "comment_reply", Name: "评论回复草稿", Domain: "comments", Action: "reply", ResourceTypes: []string{"comment"}, OutputType: "comment_reply", Tool: "comments.propose_reply", RequiresApproval: true},
	{Key: "post_seo_review", Name: "文章 SEO 审校", Domain: "content", Action: "seo_review", ResourceTypes: []string{"post"}, OutputType: "review", Tool: "content.audit_post"},
	{Key: "post_update", Name: "文章正文改写与更新", Domain: "content", Action: "post_update", ResourceTypes: []string{"post"}, OutputType: "post_draft", Tool: "content.propose_update", RequiresApproval: true},
	{Key: "page_review", Name: "单页内容与SEO审校", Domain: "content", Action: "page_review", ResourceTypes: []string{"page"}, OutputType: "review", Tool: "content.audit_page"},
	{Key: "page_update", Name: "单页正文改写与更新", Domain: "content", Action: "page_update", ResourceTypes: []string{"page"}, OutputType: "page_draft", Tool: "content.propose_page_update", RequiresApproval: true},
	{Key: "media_alt_review", Name: "媒体无障碍检查", Domain: "media", Action: "alt_review", ResourceTypes: []string{"media_asset"}, OutputType: "review", Tool: "media.get_asset"},
}

func Templates() []Template { return append([]Template(nil), templates...) }

// persistedTemplates are the stable keys used by migration/bootstrap starter
// Workflows. They are ordinary versioned Workflows, but Preflight still needs
// their capability and approval contract so a seeded row cannot bypass the
// same checks as a planner-created Workflow.
var persistedTemplates = []Template{
	{Key: "daily_news", Name: "AI 每日资讯", Tool: "rss.fetch"},
	{Key: "weekly_operations", Name: "周度运营复盘", Tool: "analytics.get_summary"},
	{Key: "stale_content_refresh", Name: "陈旧内容更新", Tool: "content.list_stale_posts", RequiresApproval: true},
	{Key: "low_engagement", Name: "低互动文章分析", Tool: "analytics.list_low_engagement_posts"},
	{Key: "selected_pre_publish_review", Name: "批量发布前审校", Tool: "content.audit_post", RequiresApproval: true},
	{Key: "selected_internal_linking", Name: "站内链接优化（手选）", Tool: "content.find_internal_links", RequiresApproval: true},
	{Key: "selected_distribution", Name: "内容再分发（手选）", Tool: "content.propose_distribution_draft", RequiresApproval: true},
	{Key: "selected_article_image_generation", Name: "生成封面/文配图（手选）", Tool: "media.create_image_task", RequiresImage: true, InputFormat: "image_brief"},
	{Key: "selected_comment_replies", Name: "评论回复草稿（手选）", Tool: "comments.propose_reply", RequiresApproval: true},
	{Key: "selected_media_review", Name: "媒体无障碍检查", Tool: "media.get_asset"},
	{Key: "selected_page_review", Name: "单页审校与优化（手选）", Tool: "content.audit_page", RequiresApproval: true},
	{Key: "selected_operations_deep_dive", Name: "运营建议深挖", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "selected_taxonomy_review", Name: "分类与标签整理", Tool: "content.list_categories"},
	{Key: "selected_mixed_review", Name: "混合内容复盘", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "scheduled_stale_resource_review", Name: "陈旧文章规则审查", Tool: "content.list_stale_posts", RequiresApproval: true},
	{Key: "scheduled_post_publish_review", Name: "发布后内容复盘", Tool: "content.audit_post", RequiresApproval: true},
	{Key: "scheduled_page_review", Name: "定期单页健康审查", Tool: "content.audit_page", RequiresApproval: true},
	{Key: "scheduled_reported_comment_review", Name: "被举报评论复盘", Tool: "comments.propose_reply", RequiresApproval: true},
	{Key: "scheduled_missing_alt_review", Name: "缺失 Alt 媒体检查", Tool: "media.get_asset"},
}

// TemplateByKey resolves both interactive planner templates and persisted
// starter templates. Keeping this lookup in one package prevents migrations,
// bootstrap and runtime preflight from silently drifting apart again.
func TemplateByKey(key string) (*Template, bool) {
	key = strings.TrimSpace(key)
	for _, group := range [][]Template{templates, persistedTemplates} {
		for index := range group {
			if group[index].Key == key {
				value := group[index]
				return &value, true
			}
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

func ParseIntent(prompt string) WorkflowIntent {
	value := strings.ToLower(strings.TrimSpace(prompt))
	intent := WorkflowIntent{Version: ProtocolVersion, Status: "ambiguous", ResourceSource: "manual", RuntimeMode: "manual", InputFields: []string{}}
	if value == "" {
		intent.AmbiguityReason = "目标为空"
		return intent
	}
	hasPromptInput := strings.Contains(value, "提示词") || strings.Contains(value, "prompt") || strings.Contains(value, "输入") || strings.Contains(value, "指令") || strings.Contains(value, "instruction") || strings.Contains(value, "要求")
	isNoApproval := strings.Contains(value, "不需要审核") || strings.Contains(value, "无需审核") || strings.Contains(value, "不需要审批") || strings.Contains(value, "无需审批") || strings.Contains(value, "直接运行") || strings.Contains(value, "no approval")
	isRewriteGoal := strings.Contains(value, "生成") || strings.Contains(value, "正文") || strings.Contains(value, "改写") || strings.Contains(value, "重写") || strings.Contains(value, "更新") || strings.Contains(value, "write") || strings.Contains(value, "update") || strings.Contains(value, "rewrite") || strings.Contains(value, "generate")

	intent.ResourceTypes = []string{"post"}
	intent.InputFields = []string{"post_ids"}
	intent.Domain = "content"
	switch {
	case strings.Contains(value, "评论") || strings.Contains(value, "comment"):
		intent.ResourceTypes, intent.InputFields, intent.Domain, intent.Action, intent.OutputType = []string{"comment"}, []string{"comment_ids"}, "comments", "reply", "comment_reply"
	case strings.Contains(value, "媒体") || strings.Contains(value, "media") || strings.Contains(value, "alt"):
		intent.ResourceTypes, intent.InputFields, intent.Domain, intent.Action, intent.OutputType = []string{"media_asset"}, []string{"media_ids"}, "media", "alt_review", "review"
	case strings.Contains(value, "图片") || strings.Contains(value, "配图") || strings.Contains(value, "封面") || strings.Contains(value, "illustration") || strings.Contains(value, "image") || strings.Contains(value, "cover"):
		intent.Domain, intent.Action, intent.OutputType = "distribution", "image_brief", "image_brief"
		briefOnly := strings.Contains(value, "brief") || strings.Contains(value, "提示词") || strings.Contains(value, "prompt")
		intent.RequiresApproval = briefOnly && !isNoApproval
		intent.RequiresImage = !briefOnly
		if intent.RequiresImage {
			intent.Domain, intent.Action, intent.OutputType = "media", "generate_image", "media_asset"
		}
	case strings.Contains(value, "newsletter") || strings.Contains(value, "邮件"):
		intent.Domain, intent.Action, intent.OutputType = "distribution", "newsletter", "newsletter_draft"
	case strings.Contains(value, "faq") || strings.Contains(value, "问答"):
		intent.Domain, intent.Action, intent.OutputType = "distribution", "faq", "faq_draft"
	case strings.Contains(value, "社媒") || strings.Contains(value, "社交") || strings.Contains(value, "social"):
		intent.Domain, intent.Action, intent.OutputType = "distribution", "social", "social_draft"
	case strings.Contains(value, "单页") || strings.Contains(value, "独立页") || strings.Contains(value, "custom page") || strings.Contains(value, "page"):
		intent.ResourceTypes, intent.InputFields, intent.Domain = []string{"page"}, []string{"page_ids"}, "content"
		if isRewriteGoal {
			intent.Action, intent.OutputType = "page_update", "page_draft"
		} else {
			intent.Action, intent.OutputType = "page_review", "review"
		}
	case strings.Contains(value, "seo") || strings.Contains(value, "审校") || strings.Contains(value, "检查"):
		intent.Domain, intent.Action, intent.OutputType = "content", "seo_review", "review"
	case isRewriteGoal:
		intent.Domain, intent.Action, intent.OutputType = "content", "post_update", "post_draft"
	default:
		intent.AmbiguityReason = "无法从目标确定资源类型和动作"
		return intent
	}
	if hasPromptInput && !contains(intent.InputFields, "prompt") {
		intent.InputFields = append(intent.InputFields, "prompt")
	}
	if isNoApproval {
		intent.RequiresApproval = false
	}
	intent.Status = "ready"
	return intent
}

func Match(intent WorkflowIntent, profiles []*domain.ProviderProfile, agents []*domain.Agent, skills []*domain.AgentSkill, catalog []tool.CatalogItem) (MatchResult, *Template, *domain.Agent) {
	result := MatchResult{Status: "unsupported", Matches: []string{}, Missing: []string{}, Warnings: []string{}, SuggestedTemplates: []string{}}
	if intent.Status != "ready" {
		result.Status, result.Missing = "ambiguous", []string{intent.AmbiguityReason}
		return result, nil, nil
	}
	for _, candidate := range templates {
		if candidate.Domain == intent.Domain && candidate.Action == intent.Action && containsAny(candidate.ResourceTypes, intent.ResourceTypes) {
			result.SuggestedTemplates = append(result.SuggestedTemplates, candidate.Key)
		}
	}
	var matched *Template
	for index := range templates {
		if templates[index].Domain == intent.Domain && templates[index].Action == intent.Action {
			matched = &templates[index]
			break
		}
	}
	if matched == nil {
		result.Missing = []string{"没有支持该动作的模板"}
		return result, nil, nil
	}
	if matched.Tool != "" {
		registered := false
		for _, item := range catalog {
			if item.Name == matched.Tool {
				registered = true
				break
			}
		}
		if !registered {
			result.Missing = append(result.Missing, "所需 Tool 未在服务端目录注册")
			return result, matched, nil
		}
	}
	if matched.RequiresImage && !hasDefaultImageProvider(profiles) {
		result.Warnings = append(result.Warnings, "未配置默认图片 Provider，不能生成真实图片")
		result.Status = "needs_configuration"
		result.Missing = append(result.Missing, "启用默认图片 Provider")
		return result, matched, nil
	}
	var selected *domain.Agent
	for _, agent := range agents {
		if !agent.Enabled || agent.Skill == nil || agent.SkillVersionID == nil || agent.ProviderProfile == nil || !agent.ProviderProfile.Enabled || !hasWritingProvider(profiles, agent.ProviderProfileID) {
			continue
		}
		if matched.Tool != "" && !contains(agent.Skill.Capabilities, matched.Tool) {
			continue
		}
		if !containsAny(matched.ResourceTypes, intent.ResourceTypes) {
			continue
		}
		if selected == nil {
			selected = agent
		}
	}
	if selected == nil {
		result.Status = "needs_configuration"
		result.Missing = append(result.Missing, "有效的 Agent、Skill、Provider 和所需 Tool 授权")
		return result, matched, nil
	}
	result.Status, result.Matches = "ready", []string{selected.Name}
	return result, matched, selected
}

func Compile(intent WorkflowIntent, template *Template, agent *domain.Agent) domain.Workflow {
	needsApproval := template != nil && template.RequiresApproval
	agentID := int64(0)
	if agent != nil {
		agentID = agent.ID
		if template == nil && intent.RequiresApproval {
			needsApproval = agent.Skill != nil && agent.Skill.ExecutionMode == domain.AgentModeApproval
		}
	}
	properties := map[string]any{"post_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "minItems": 1, "maxItems": 20, "x-gouno-resource": "post", "x-gouno-widget": "entity-multi-select"}}
	required := []string{"post_ids"}
	if intent.Action == "reply" {
		properties = map[string]any{"comment_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "minItems": 1, "maxItems": 20, "x-gouno-resource": "comment", "x-gouno-widget": "entity-multi-select"}}
		required = []string{"comment_ids"}
	} else if contains(intent.ResourceTypes, "page") {
		properties = map[string]any{"page_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "minItems": 1, "maxItems": 20, "x-gouno-resource": "page", "x-gouno-widget": "entity-multi-select"}}
		required = []string{"page_ids"}
	}
	if contains(intent.InputFields, "prompt") {
		properties["prompt"] = map[string]any{
			"type":        "string",
			"title":       "修改要求/提示词",
			"description": "输入针对该单页/内容的具体生成要求或提示词",
		}
		required = append(required, "prompt")
	}
	if template != nil && template.InputFormat != "" {
		properties["format"] = map[string]any{"type": "string", "enum": []string{template.InputFormat}, "default": template.InputFormat}
		required = append(required, "format")
	}
	schema := map[string]any{"type": "object", "additionalProperties": false, "required": required, "properties": properties}
	raw, _ := json.Marshal(schema)
	steps := []domain.WorkflowStep{{ID: "analyze", Type: "model", AgentID: agentID, InputPointer: "/input", IncludeContext: true}}
	if needsApproval {
		steps = append(steps, domain.WorkflowStep{ID: "review", Type: "approval_gate", Name: "人工审批", InputPointer: "/steps/analyze"})
	}
	steps = append(steps, domain.WorkflowStep{ID: "result", Type: "output", OutputPointer: "/steps/analyze"})
	name := "AI 工作流草案"
	description := "根据需求生成的受控 Workflow 草案"
	if template != nil {
		name, description = template.Name, fmt.Sprintf("%s：%s", template.Name, intent.Action)
	}
	templateKey := ""
	if template != nil {
		templateKey = template.Key
	}
	return domain.Workflow{Name: name, Description: description, Timezone: "Asia/Shanghai", TemplateKey: &templateKey, InputSchema: raw, Steps: steps, ScopePolicy: domain.WorkflowScopePolicy{Mode: "strict"}}
}

func hasDefaultImageProvider(profiles []*domain.ProviderProfile) bool {
	for _, p := range profiles {
		if p.Enabled && p.IsDefaultImage {
			return true
		}
	}
	return false
}
func hasWritingProvider(profiles []*domain.ProviderProfile, id int64) bool {
	for _, p := range profiles {
		if p.ID == id && p.Enabled {
			return true
		}
	}
	return false
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func containsAny(values, targets []string) bool {
	for _, value := range values {
		if contains(targets, value) {
			return true
		}
	}
	return false
}

type AutomationPlan struct {
	Workflow      domain.Workflow `json:"workflow"`
	Provider      map[string]any  `json:"provider"`
	Skill         map[string]any  `json:"skill"`
	Agent         map[string]any  `json:"agent"`
	Prerequisites []string        `json:"prerequisites"`
	Warnings      []string        `json:"warnings"`
	Intent        WorkflowIntent  `json:"intent"`
	Template      map[string]any  `json:"template"`
	Match         MatchResult     `json:"match"`
}

func AutomationPlanCapabilities(prompt string) []string {
	value := strings.ToLower(prompt)
	if strings.Contains(value, "评论") || strings.Contains(value, "comment") {
		return []string{"comments.get_comment", "comments.propose_reply"}
	}
	if strings.Contains(value, "图片") || strings.Contains(value, "配图") || strings.Contains(value, "封面") || strings.Contains(value, "illustration") || strings.Contains(value, "image") || strings.Contains(value, "cover") {
		if IsExplicitImageBriefGoal(value) {
			return []string{"content.get_post", "content.propose_distribution_draft"}
		}
		return []string{"content.get_post", "media.create_image_task"}
	}
	if strings.Contains(value, "单页") || strings.Contains(value, "独立页") || strings.Contains(value, "custom page") || strings.Contains(value, "page") {
		if strings.Contains(value, "生成") || strings.Contains(value, "正文") || strings.Contains(value, "改写") || strings.Contains(value, "重写") || strings.Contains(value, "更新") || strings.Contains(value, "write") || strings.Contains(value, "update") || strings.Contains(value, "rewrite") || strings.Contains(value, "generate") {
			return []string{"content.get_page", "content.propose_page_update"}
		}
		return []string{"content.get_page", "content.audit_page"}
	}
	if strings.Contains(value, "媒体") || strings.Contains(value, "media") || strings.Contains(value, "alt") {
		return []string{"media.get_asset"}
	}
	if strings.Contains(value, "分类") || strings.Contains(value, "标签") || strings.Contains(value, "taxonomy") || strings.Contains(value, "tag") {
		return []string{"content.list_categories", "content.list_tags"}
	}
	return []string{"content.audit_post", "content.check_links"}
}

func AutomationPlanScore(capabilities, wanted []string) int {
	score := 0
	for _, capability := range capabilities {
		for _, w := range wanted {
			if capability == w {
				score++
				break
			}
		}
	}
	return score
}

func BuildAutomationPlan(prompt string, profiles []*domain.ProviderProfile, agents []*domain.Agent, skills []*domain.AgentSkill) AutomationPlan {
	plan := AutomationPlan{Prerequisites: []string{}, Warnings: []string{}}
	wantedCapabilities := AutomationPlanCapabilities(prompt)
	var provider *domain.ProviderProfile
	for _, item := range profiles {
		if item.Enabled && item.IsDefaultWriting {
			provider = item
			break
		}
	}
	if provider == nil {
		plan.Provider = map[string]any{"status": "missing", "message": "需要一个已启用的默认写作 Provider", "draft": map[string]any{"enabled": false}}
		plan.Prerequisites = append(plan.Prerequisites, "配置并启用默认写作 Provider")
	} else {
		plan.Provider = map[string]any{"status": "ready", "id": provider.ID, "name": provider.Name, "model": provider.Model}
	}

	var reusableSkill *domain.AgentSkill
	bestSkillScore := -1
	for _, agent := range agents {
		score := 0
		if agent.Skill != nil {
			score = AutomationPlanScore(agent.Skill.Capabilities, wantedCapabilities)
		}
		if agent.Enabled && agent.Skill != nil && score > bestSkillScore {
			reusableSkill = agent.Skill
			bestSkillScore = score
		}
	}
	if reusableSkill != nil {
		plan.Skill = map[string]any{"status": "reuse", "id": reusableSkill.ID, "name": reusableSkill.Name, "version_id": reusableSkill.VersionID, "capabilities": reusableSkill.Capabilities}
	} else if len(skills) > 0 {
		for _, skill := range skills {
			score := AutomationPlanScore(skill.Capabilities, wantedCapabilities)
			if score > bestSkillScore {
				reusableSkill, bestSkillScore = skill, score
			}
		}
		plan.Skill = map[string]any{"status": "reuse", "id": reusableSkill.ID, "name": reusableSkill.Name, "version_id": reusableSkill.VersionID, "capabilities": reusableSkill.Capabilities}
	} else {
		skillName := "内容审校助手"
		systemPrompt := "在授权资源范围内执行内容分析，并为需要的变更生成审批提案。"
		val := strings.ToLower(prompt)
		if strings.Contains(val, "单页") || strings.Contains(val, "page") {
			if strings.Contains(val, "生成") || strings.Contains(val, "正文") || strings.Contains(val, "改写") || strings.Contains(val, "重写") || strings.Contains(val, "更新") {
				skillName = "单页写作与更新助手"
				systemPrompt = "分析指定单页的内容与用户提示词要求，生成高质量正文并提交修改提案。"
			} else {
				skillName = "单页审校与SEO助手"
				systemPrompt = "审校单页的内容质量与 SEO 配置，发现问题并提交修改建议。"
			}
		} else if strings.Contains(val, "图片") || strings.Contains(val, "配图") || strings.Contains(val, "封面") {
			skillName = "文章视觉与配图助手"
			systemPrompt = "阅读文章正文并生成符合主题的封面与文中配图任务。"
		} else if strings.Contains(val, "评论") || strings.Contains(val, "comment") {
			skillName = "评论回复与互动助手"
			systemPrompt = "分析访客评论内容并拟定得体、专业的回复草案供人工审核。"
		} else if strings.Contains(val, "社媒") || strings.Contains(val, "社交") || strings.Contains(val, "newsletter") || strings.Contains(val, "邮件") {
			skillName = "多渠道内容分发助手"
			systemPrompt = "将长文章提炼为适合社交媒体与邮件通讯的精简分发草案。"
		}
		plan.Skill = map[string]any{"status": "draft", "draft": map[string]any{
			"name": skillName, "description": prompt, "system_prompt": systemPrompt, "capabilities": wantedCapabilities, "execution_mode": "approval", "enabled": false,
		}}
		plan.Prerequisites = append(plan.Prerequisites, "确认并保存一个 Skill 草案")
	}

	var reusableAgent *domain.Agent
	bestAgentScore := -1
	for _, agent := range agents {
		score := 0
		if agent.Skill != nil {
			score = AutomationPlanScore(agent.Skill.Capabilities, wantedCapabilities)
		}
		if agent.Enabled && agent.SkillVersionID != nil && agent.Skill != nil && score > bestAgentScore {
			reusableAgent = agent
			bestAgentScore = score
		}
	}
	if reusableAgent != nil {
		plan.Agent = map[string]any{"status": "reuse", "id": reusableAgent.ID, "name": reusableAgent.Name, "provider_profile_id": reusableAgent.ProviderProfileID, "skill_version_id": reusableAgent.SkillVersionID}
		plan.Workflow = FallbackWorkflowDraft(prompt, reusableAgent.ID, reusableAgent.Skill != nil && reusableAgent.Skill.ExecutionMode == domain.AgentModeApproval)
	} else {
		providerID, skillVersionID := int64(0), int64(0)
		if provider != nil {
			providerID = provider.ID
		}
		if reusableSkill != nil {
			skillVersionID = reusableSkill.VersionID
		}
		agentName := "内容审校 Agent"
		if draftSkill, ok := plan.Skill["draft"].(map[string]any); ok && draftSkill["name"] != nil {
			agentName = fmt.Sprintf("%s Agent", strings.TrimSuffix(draftSkill["name"].(string), "助手"))
		}
		draft := map[string]any{"name": agentName, "description": prompt, "enabled": false, "provider_profile_id": providerID, "skill_version_id": skillVersionID}
		plan.Agent = map[string]any{"status": "draft", "draft": draft}
		plan.Prerequisites = append(plan.Prerequisites, "确认 Provider 与 Skill 后保存 Agent 草案")
		plan.Workflow = FallbackWorkflowDraft(prompt, 0, true)
		plan.Workflow.Steps[0].AgentID = 0
	}
	if provider == nil {
		plan.Warnings = append(plan.Warnings, "Provider 未就绪，当前只生成未启用的本地草案，不会调用模型")
	}
	return plan
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

func FallbackWorkflowDraft(goal string, agentID int64, needsApproval bool) domain.Workflow {
	value := strings.ToLower(goal)
	isImageBrief := strings.Contains(value, "图片") || strings.Contains(value, "配图") || strings.Contains(value, "封面") || strings.Contains(value, "image") || strings.Contains(value, "cover")
	isPage := strings.Contains(value, "单页") || strings.Contains(value, "独立页") || strings.Contains(value, "page")
	hasPrompt := strings.Contains(value, "提示词") || strings.Contains(value, "prompt") || strings.Contains(value, "输入") || strings.Contains(value, "指令") || strings.Contains(value, "要求")

	resourceKey := "post_ids"
	resourceType := "post"
	if isPage {
		resourceKey = "page_ids"
		resourceType = "page"
	}

	properties := map[string]any{
		resourceKey: map[string]any{
			"type":             "array",
			"items":            map[string]any{"type": "integer"},
			"minItems":         1,
			"maxItems":         20,
			"x-gouno-resource": resourceType,
			"x-gouno-widget":   "entity-multi-select",
		},
	}
	required := []string{resourceKey}

	if isImageBrief {
		properties["format"] = map[string]any{
			"type":    "string",
			"enum":    []string{"image_brief"},
			"default": "image_brief",
		}
		required = append(required, "format")
	}
	if hasPrompt {
		properties["prompt"] = map[string]any{
			"type":        "string",
			"title":       "修改要求/提示词",
			"description": "输入针对该单页/内容的具体生成要求或提示词",
		}
		required = append(required, "prompt")
	}
	schemaRaw, _ := json.Marshal(map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             required,
		"properties":           properties,
	})

	steps := []domain.WorkflowStep{{ID: "analyze", Type: "model", AgentID: agentID, InputPointer: "/input", IncludeContext: true}}
	if needsApproval {
		steps = append(steps, domain.WorkflowStep{ID: "review", Type: "approval_gate", Name: "人工审批", InputPointer: "/steps/analyze"})
	}
	steps = append(steps, domain.WorkflowStep{ID: "result", Type: "output", OutputPointer: "/steps/analyze"})
	return domain.Workflow{
		Name: "AI 工作流草案", Description: goal, Timezone: "Asia/Shanghai",
		InputSchema: schemaRaw,
		Steps:       steps, ScopePolicy: domain.WorkflowScopePolicy{Mode: "strict"},
	}
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

func IsImageBriefGoal(goal string) bool {
	value := strings.ToLower(goal)
	return strings.Contains(value, "图片") || strings.Contains(value, "配图") || strings.Contains(value, "封面") || strings.Contains(value, "illustration") || strings.Contains(value, "image") || strings.Contains(value, "cover")
}

func IsExplicitImageBriefGoal(goal string) bool {
	value := strings.ToLower(goal)
	return IsImageBriefGoal(value) && (strings.Contains(value, "brief") || strings.Contains(value, "提示词") || strings.Contains(value, "prompt"))
}

func EnforceImageBriefContract(goal string, draft *domain.Workflow) {
	if !IsImageBriefGoal(goal) {
		return
	}
	contract := FallbackWorkflowDraft(goal, 0, false)
	draft.InputSchema = contract.InputSchema
	var normalize func([]domain.WorkflowStep)
	normalize = func(steps []domain.WorkflowStep) {
		for index := range steps {
			if steps[index].Type == "model" {
				steps[index].InputPointer = "/input"
			}
			if len(steps[index].Steps) > 0 {
				normalize(steps[index].Steps)
			}
		}
	}
	normalize(draft.Steps)
}

func NormalizeDraftAgentIDs(steps []domain.WorkflowStep, fallbackID int64) []domain.WorkflowStep {
	normalized := make([]domain.WorkflowStep, len(steps))
	for i, step := range steps {
		s := step
		if s.Type == "model" && s.AgentID <= 0 {
			s.AgentID = fallbackID
		}
		if len(s.Steps) > 0 {
			s.Steps = NormalizeDraftAgentIDs(s.Steps, fallbackID)
		}
		normalized[i] = s
	}
	return normalized
}

const WorkflowPlannerPrompt = `You are workflow-planner/v6 for a blog administration product. Return exactly one JSON object and nothing else: no Markdown, code fence, commentary, or prose.
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

const WorkflowPlannerCorrectionPrompt = `The previous response was not a valid Workflow draft. Return a corrected JSON object only. Keep exactly the allowed keys name, description, input_schema, and steps. Steps may only be resource_query, for_each, model, approval_gate, and output; agent_id must be an integer from the supplied available_agents; never add image, tool, connector, HTTP, or publish steps. For image-related goals, use the Agent's authorized media.create_image_task capability and do not add approval_gate; image selection and application remain explicit user actions. Use post_ids for posts, page_ids for pages, and prompt for text instructions when required. input_schema must be an object schema with additionalProperties false.`

