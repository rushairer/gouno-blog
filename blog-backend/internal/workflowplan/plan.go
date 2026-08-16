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
	{Key: "selected_operations_deep_dive", Name: "运营建议深挖", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "selected_taxonomy_review", Name: "分类与标签整理", Tool: "content.list_categories"},
	{Key: "selected_mixed_review", Name: "混合内容复盘", Tool: "operations.get_suggestion", RequiresApproval: true},
	{Key: "scheduled_stale_resource_review", Name: "陈旧文章规则审查", Tool: "content.list_stale_posts", RequiresApproval: true},
	{Key: "scheduled_post_publish_review", Name: "发布后内容复盘", Tool: "content.audit_post", RequiresApproval: true},
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
		intent.RequiresApproval = briefOnly
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
	case strings.Contains(value, "seo") || strings.Contains(value, "审校") || strings.Contains(value, "检查"):
		intent.Domain, intent.Action, intent.OutputType = "content", "seo_review", "review"
	default:
		intent.AmbiguityReason = "无法从目标确定资源类型和动作"
		return intent
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
		// The template defines whether this concrete operation produces an
		// approval proposal. An approval-mode Agent may also perform a bounded
		// internal task or a read-only analysis without creating a redundant
		// approval gate; content-changing templates remain explicitly governed.
		if template == nil {
			needsApproval = agent.Skill != nil && agent.Skill.ExecutionMode == domain.AgentModeApproval
		}
	}
	properties := map[string]any{"post_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "minItems": 1, "maxItems": 20, "x-gouno-resource": "post", "x-gouno-widget": "entity-multi-select"}}
	required := []string{"post_ids"}
	if intent.Action == "reply" {
		properties = map[string]any{"comment_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "minItems": 1, "maxItems": 20, "x-gouno-resource": "comment", "x-gouno-widget": "entity-multi-select"}}
		required = []string{"comment_ids"}
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
