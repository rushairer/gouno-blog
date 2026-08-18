package tool

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

var (
	ErrUnknownTool     = errors.New("unknown tool")
	ErrUnauthorized    = errors.New("tool capability is not authorized")
	ErrInvalidArgument = errors.New("invalid tool arguments")
)

var emptyParametersSchema = json.RawMessage(`{"type":"object","additionalProperties":false}`)

var catalogDescriptionsZH = map[string]string{
	"rss.fetch": "从已配置白名单中的 RSS 或 Atom 源获取并标准化资讯条目。", "data.json_parse": "从模型输出中解析长度受限的 JSON 对象。", "content.create_post": "按 Agent 的受控发布策略创建并校验博客文章。",
	"content.list_posts": "列出博客文章，包含草稿和定时发布文章。", "content.get_post": "按数字 ID 读取一篇博客文章。", "content.search_posts": "按标题、摘要或正文搜索已发布文章。", "content.list_tags": "列出博客中的全部标签。",
	"content.check_links": "检查一篇文章中公开 HTTP(S) 链接的可用性。", "content.audit_post": "对草稿、定时或已发布文章执行确定性的内容质量检查。", "content.find_internal_links": "为文章推荐尚未引用的相关文章作为站内链接。",
	"content.find_related": "搜索相关文章并返回按相关度排序的证据摘要。", "content.search_knowledge": "检索已建立索引的已发布内容并返回可验证引用。", "content.list_stale_posts": "列出超过指定天数未更新的已发布文章。",
	"content.list_orphan_posts": "列出没有被其他文章站内链接引用的已发布文章。", "comments.list_pending": "列出待处理或被举报的评论，供审核分析使用。", "analytics.get_summary": "读取当前博客的数据分析摘要。",
	"analytics.list_low_engagement_posts": "列出浏览量足够但互动率较低的已发布文章。", "content.propose_draft": "提交一篇新博客草稿的审批提案。", "content.propose_update": "提交对现有博客文章的修改审批提案。",
	"content.propose_tags": "提交替换现有文章标签的审批提案。", "comments.propose_reply": "提交评论回复草稿的审批提案。", "content.propose_task": "提交编辑任务的审批提案。",
	"content.propose_distribution_draft": "为文章提交社媒、邮件、FAQ 或图片 Brief 草稿；不会向外部服务发送内容。", "content.list_broken_links": "列出已发布文章中缓存的失效链接证据。",
	"media.create_image_task":    "为已授权文章创建站内图片生成任务；不会修改或发布文章。",
	"content.propose_candidates": "提交标题、摘要或封面 Alt 文案候选，供人工选择。", "content.list_tag_bloat": "识别低使用率或大小写重复的标签。", "operations.propose_suggestion": "提交带证据的站内运营建议审批提案。",
	"media.get_asset": "读取一个媒体资源的元数据，不返回文件内容。", "operations.get_suggestion": "读取一条运营建议及其证据。", "content.list_categories": "列出分类与文章数量。", "comments.get_comment": "读取一条评论并移除私有身份字段。",
	"content.list_pages": "列出单页列表，包含草稿和已发布单页。", "content.get_page": "按数字 ID 读取一个单页的详细信息。", "content.audit_page": "对草稿或已发布单页执行确定性的内容质量检查。", "content.check_page_links": "检查一个单页中公开 HTTP(S) 链接的可用性。", "content.propose_page_draft": "提交一个新单页草稿的审批提案。", "content.propose_page_update": "提交对现有单页的修改审批提案。",
}

type Proposal struct {
	ActionType     string          `json:"action_type"`
	TargetType     string          `json:"target_type"`
	TargetID       *int64          `json:"target_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	BeforeSnapshot json.RawMessage `json:"before_snapshot,omitempty"`
}

type ScopeRule struct {
	ResourceType       string   `json:"resource_type,omitempty"`
	Argument           string   `json:"argument,omitempty"`
	Discovery          bool     `json:"discovery,omitempty"`
	OutputResourceType string   `json:"output_resource_type,omitempty"`
	OutputKeys         []string `json:"output_keys,omitempty"`
}

type Definition struct {
	Name          string
	Description   string
	Parameters    json.RawMessage
	Configuration json.RawMessage
	Output        json.RawMessage
	Surfaces      []string
	Risk          domain.ToolRiskLevel
	Scope         *ScopeRule
	Execute       func(context.Context, json.RawMessage) (any, error)
	Propose       func(context.Context, json.RawMessage) (*Proposal, error)
}

type Registry struct {
	definitions map[string]Definition
}

type CatalogItem struct {
	Name                string               `json:"name"`
	Description         string               `json:"description"`
	DescriptionZH       string               `json:"description_zh,omitempty"`
	Parameters          json.RawMessage      `json:"parameters"`
	ConfigurationSchema json.RawMessage      `json:"configuration_schema,omitempty"`
	Output              json.RawMessage      `json:"output_schema,omitempty"`
	Surfaces            []string             `json:"surfaces"`
	Risk                domain.ToolRiskLevel `json:"risk_level"`
	Scope               *ScopeRule           `json:"scope,omitempty"`
}

func New(definitions ...Definition) *Registry {
	items := make(map[string]Definition, len(definitions))
	for _, definition := range definitions {
		definition = normalizeDefinition(definition)
		items[definition.Name] = definition
	}
	return &Registry{definitions: items}
}

func normalizeDefinition(definition Definition) Definition {
	if len(definition.Parameters) == 0 {
		definition.Parameters = append(json.RawMessage(nil), emptyParametersSchema...)
	}
	if len(definition.Surfaces) == 0 {
		definition.Surfaces = []string{"agent"}
	}
	return definition
}

func catalogSchema(value json.RawMessage, fallback json.RawMessage) json.RawMessage {
	if json.Valid(value) {
		return value
	}
	if len(fallback) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), fallback...)
}

func (r *Registry) Definitions(capabilities []string) []provider.ToolDefinition {
	result := make([]provider.ToolDefinition, 0, len(capabilities))
	for _, name := range capabilities {
		definition, ok := r.definitions[name]
		if !ok || !slices.Contains(definition.Surfaces, "agent") {
			continue
		}
		result = append(result, provider.ToolDefinition{
			Name: definition.Name, Description: definition.Description,
			Parameters: catalogSchema(definition.Parameters, emptyParametersSchema),
		})
	}
	return result
}

// MergeBindingArguments applies Skill-owned fixed Tool arguments. Model supplied
// values can fill unconfigured fields but cannot override a configured value.
func MergeBindingArguments(bindings json.RawMessage, name string, arguments json.RawMessage) (json.RawMessage, error) {
	var configured map[string]json.RawMessage
	if len(bindings) == 0 {
		bindings = json.RawMessage(`{}`)
	}
	if err := json.Unmarshal(bindings, &configured); err != nil || configured == nil {
		return nil, ErrInvalidArgument
	}
	var supplied map[string]json.RawMessage
	if err := json.Unmarshal(arguments, &supplied); err != nil || supplied == nil {
		return nil, ErrInvalidArgument
	}
	fixed, exists := configured[name]
	if !exists {
		return arguments, nil
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal(fixed, &values); err != nil || values == nil {
		return nil, ErrInvalidArgument
	}
	for key, value := range values {
		supplied[key] = value
	}
	return json.Marshal(supplied)
}

func (r *Registry) Invoke(ctx context.Context, capabilities []string, name string, arguments json.RawMessage) (domain.ToolRiskLevel, json.RawMessage, *Proposal, error) {
	if !slices.Contains(capabilities, name) {
		return "", nil, nil, ErrUnauthorized
	}
	definition, ok := r.definitions[name]
	if !ok {
		return "", nil, nil, ErrUnknownTool
	}
	if !json.Valid(arguments) {
		return definition.Risk, nil, nil, ErrInvalidArgument
	}
	if definition.Risk == domain.ToolRiskPropose {
		if definition.Propose == nil {
			return definition.Risk, nil, nil, fmt.Errorf("%w: proposal handler missing", ErrUnknownTool)
		}
		proposal, err := definition.Propose(ctx, arguments)
		if err != nil {
			return definition.Risk, nil, nil, err
		}
		result, _ := json.Marshal(map[string]any{
			"status": "awaiting_approval", "action_type": proposal.ActionType,
		})
		return definition.Risk, result, proposal, nil
	}
	if definition.Execute == nil {
		return definition.Risk, nil, nil, fmt.Errorf("%w: execute handler missing", ErrUnknownTool)
	}
	value, err := definition.Execute(ctx, arguments)
	if err != nil {
		return definition.Risk, nil, nil, err
	}
	result, err := json.Marshal(value)
	return definition.Risk, result, nil, err
}

func (r *Registry) Catalog() []CatalogItem {
	result := make([]CatalogItem, 0, len(r.definitions))
	for _, definition := range r.definitions {
		result = append(result, CatalogItem{
			Name: definition.Name, Description: definition.Description, DescriptionZH: catalogDescriptionsZH[definition.Name],
			Parameters:          catalogSchema(definition.Parameters, emptyParametersSchema),
			ConfigurationSchema: catalogSchema(definition.Configuration, nil),
			Output:              catalogSchema(definition.Output, nil),
			Surfaces:            definition.Surfaces, Risk: definition.Risk, Scope: definition.Scope,
		})
	}
	slices.SortFunc(result, func(a, b CatalogItem) int {
		if a.Name < b.Name {
			return -1
		}
		if a.Name > b.Name {
			return 1
		}
		return 0
	})
	return result
}

func (r *Registry) Names() []string {
	result := make([]string, 0, len(r.definitions))
	for name := range r.definitions {
		result = append(result, name)
	}
	slices.Sort(result)
	return result
}

func (r *Registry) AgentNames() []string {
	result := make([]string, 0, len(r.definitions))
	for name, definition := range r.definitions {
		if slices.Contains(definition.Surfaces, "agent") {
			result = append(result, name)
		}
	}
	slices.Sort(result)
	return result
}

func (r *Registry) ProposalNames() []string {
	result := make([]string, 0)
	for name, definition := range r.definitions {
		if definition.Risk == domain.ToolRiskPropose {
			result = append(result, name)
		}
	}
	slices.Sort(result)
	return result
}

func (r *Registry) Risk(name string) (domain.ToolRiskLevel, bool) {
	item, ok := r.definitions[name]
	return item.Risk, ok
}

func (r *Registry) Scope(name string) (*ScopeRule, bool) {
	item, ok := r.definitions[name]
	return item.Scope, ok
}

func (r *Registry) Register(definitions ...Definition) error {
	for _, definition := range definitions {
		if definition.Name == "" {
			return fmt.Errorf("%w: empty tool name", ErrUnknownTool)
		}
		if _, exists := r.definitions[definition.Name]; exists {
			return fmt.Errorf("%w: duplicate tool %q", ErrUnknownTool, definition.Name)
		}
		definition = normalizeDefinition(definition)
		if !json.Valid(definition.Parameters) {
			return fmt.Errorf("%w: invalid parameters schema for tool %q", ErrInvalidArgument, definition.Name)
		}
		if len(definition.Output) > 0 && !json.Valid(definition.Output) {
			return fmt.Errorf("%w: invalid output schema for tool %q", ErrInvalidArgument, definition.Name)
		}
		r.definitions[definition.Name] = definition
	}
	return nil
}
