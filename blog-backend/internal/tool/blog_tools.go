package tool

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/knowledge"
	"github.com/rushairer/blog-backend/internal/service"
)

type BlogTools struct {
	posts      *service.PostService
	community  *service.CommunityService
	growth     *service.GrowthService
	pages      *service.PageService
	linkClient linkHTTPClient
	knowledge  *knowledge.Service
}

func NewBlogRegistry(posts *service.PostService, community *service.CommunityService, growth *service.GrowthService, pages *service.PageService, knowledgeServices ...*knowledge.Service) *Registry {
	var knowledgeService *knowledge.Service
	if len(knowledgeServices) > 0 {
		knowledgeService = knowledgeServices[0]
	}
	tools := &BlogTools{
		posts: posts, community: community, growth: growth, pages: pages,
		linkClient: newSafeLinkClient(), knowledge: knowledgeService,
	}
	return New(
		Definition{
			Name: "rss.fetch", Description: "Fetch and normalize entries from configured allowlisted RSS or Atom feeds.",
			Parameters:     schema(`{"feeds":{"type":"array","minItems":1,"maxItems":10,"items":{"type":"object","additionalProperties":false,"required":["name","url"],"properties":{"name":{"type":"string","maxLength":120},"url":{"type":"string","format":"uri"}}},"max_per_feed":{"type":"integer","minimum":1,"maximum":20},"max_items":{"type":"integer","minimum":1,"maximum":50}}`, "feeds"),
			Configuration:  schema(`{"feeds":{"type":"array","minItems":1,"maxItems":10,"items":{"type":"object","additionalProperties":false,"required":["name","url"],"properties":{"name":{"type":"string","maxLength":120},"url":{"type":"string","format":"uri"}}},"max_per_feed":{"type":"integer","minimum":1,"maximum":20},"max_items":{"type":"integer","minimum":1,"maximum":50}}`, "feeds"),
			DefaultBinding: json.RawMessage(`{"feeds":[{"name":"OpenAI News","url":"https://openai.com/news/rss.xml"},{"name":"Google Blog","url":"https://blog.google/rss/"},{"name":"TechCrunch AI","url":"https://techcrunch.com/category/artificial-intelligence/feed/"}],"max_per_feed":8,"max_items":20}`),
			Output:         json.RawMessage(`{"type":"object","properties":{"items":{"type":"array"}}}`), Surfaces: []string{"agent"}, Risk: domain.ToolRiskRead,
			Execute:        fetchRSS,
		},
		Definition{
			Name: "data.json_parse", Description: "Parse a bounded JSON object from a model output.",
			Parameters: schema(`{"text":{"type":"string","maxLength":50000}}`, "text"),
			Output:     json.RawMessage(`{"type":"object"}`), Surfaces: []string{"agent"}, Risk: domain.ToolRiskRead,
			Execute: parseJSON,
		},
		Definition{
			Name: "content.create_post", Description: "Create a validated blog post under the Agent's configured publication policy.",
			Parameters: schema(`{"title":{"type":"string","minLength":1,"maxLength":500},"slug":{"type":"string","maxLength":500},"summary":{"type":"string","maxLength":5000},"content":{"type":"string","minLength":1,"maxLength":200000},"tags":{"type":"array","maxItems":30,"items":{"type":"string","maxLength":100}}}`, "title", "content"),
			Output:     json.RawMessage(`{"type":"object","properties":{"status":{"type":"string"},"post_id":{"type":"integer"},"approval_id":{"type":"integer"}}}`), Surfaces: []string{"agent"}, Risk: domain.ToolRiskWrite,
		},
		Definition{
			Name: "content.list_posts", Description: "List blog posts, including drafts and scheduled posts.",
			Parameters: schema(`{"page":{"type":"integer","minimum":1},"page_size":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id"}}, Execute: tools.listPosts,
		},
		Definition{
			Name: "content.get_post", Description: "Read one blog post by numeric ID.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "post", Argument: "id"}, Execute: tools.getPost,
		},
		Definition{
			Name: "content.search_posts", Description: "Search published blog posts by title, summary, or content.",
			Parameters: schema(`{"query":{"type":"string","minLength":1},"limit":{"type":"integer","minimum":1,"maximum":20}}`, "query"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id"}}, Execute: tools.searchPosts,
		},
		Definition{
			Name: "content.list_tags", Description: "List all blog tags.",
			Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "tag", OutputKeys: []string{"name"}}, Execute: tools.listTags,
		},
		Definition{
			Name: "content.list_pages", Description: "List custom pages, including drafts and navigation pages.",
			Parameters: schema(`{"page":{"type":"integer","minimum":1},"page_size":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "page", OutputKeys: []string{"id"}}, Execute: tools.listPages,
		},
		Definition{
			Name: "content.get_page", Description: "Read one custom page by numeric ID.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "page", Argument: "id"}, Execute: tools.getPage,
		},
		Definition{
			Name: "content.audit_page", Description: "Run deterministic content-quality checks for a draft or published custom page.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "page", Argument: "id"}, Execute: tools.auditPage,
		},
		Definition{
			Name: "content.check_page_links", Description: "Check public HTTP(S) links found in one custom page.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "page", Argument: "id"}, Execute: tools.checkPageLinks,
		},
		Definition{
			Name: "content.propose_page_draft", Description: "Create a new custom page draft proposal.",
			Parameters: schema(`{"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"template":{"type":"string"},"show_in_nav":{"type":"boolean"},"allow_comments":{"type":"boolean"},"sort_order":{"type":"integer"},"seo_title":{"type":"string"},"seo_description":{"type":"string"}}`, "title", "slug"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{AllowsCreate: true}, Propose: tools.proposePageDraft,
		},
		Definition{
			Name: "content.propose_page_update", Description: "Propose changes to an existing custom page.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"template":{"type":"string"},"status":{"type":"string","enum":["draft","published"]},"show_in_nav":{"type":"boolean"},"allow_comments":{"type":"boolean"},"sort_order":{"type":"integer"},"seo_title":{"type":"string"},"seo_description":{"type":"string"}}`, "id"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{ResourceType: "page", Argument: "id"}, Propose: tools.proposePageUpdate,
		},
		Definition{
			Name: "content.check_links", Description: "Check public HTTP(S) links found in one post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "post", Argument: "id"}, Execute: tools.checkLinks,
		},
		Definition{
			Name: "content.audit_post", Description: "Run deterministic content-quality checks for a draft, scheduled, or published post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "post", Argument: "id"}, Execute: tools.auditPost,
		},
		Definition{
			Name: "content.find_internal_links", Description: "Suggest relevant published posts that are not already linked from one post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"limit":{"type":"integer","minimum":1,"maximum":10}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "post", Argument: "id", Discovery: true, OutputResourceType: "post", OutputKeys: []string{"post_id", "id"}}, Execute: tools.findInternalLinks,
		},
		Definition{
			Name: "content.find_related", Description: "Search published posts related to one post and return relevance-ranked evidence snippets.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"query":{"type":"string","minLength":1},"limit":{"type":"integer","minimum":1,"maximum":10}}`, "id"),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{ResourceType: "post", Argument: "id", Discovery: true, OutputResourceType: "post", OutputKeys: []string{"post_id", "id"}}, Execute: tools.findRelatedContent,
		},
		Definition{
			Name: "content.search_knowledge", Description: "Search indexed published content and return validated citation evidence.",
			Parameters:     schema(`{"query":{"type":"string","minLength":1},"limit":{"type":"integer","minimum":1,"maximum":20}}`, "query"),
			Configuration:  schema(`{"limit":{"type":"integer","minimum":1,"maximum":20}}`),
			DefaultBinding: json.RawMessage(`{"limit":8}`),
			Risk:           domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"post_id"}}, Execute: tools.searchKnowledge,
		},
		Definition{
			Name: "content.list_stale_posts", Description: "List published posts that have not been updated for a chosen number of days.",
			Parameters:     schema(`{"older_than_days":{"type":"integer","minimum":1,"maximum":3650},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Configuration:  schema(`{"older_than_days":{"type":"integer","minimum":1,"maximum":3650},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			DefaultBinding: json.RawMessage(`{"older_than_days":180,"limit":20}`),
			Risk:           domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id", "post_id"}}, Execute: tools.findStalePosts,
		},
		Definition{
			Name: "content.list_orphan_posts", Description: "List published posts with no detected relative internal links from another published post.",
			Parameters: schema(`{"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id", "post_id"}}, Execute: tools.findOrphanPosts,
		},
		Definition{
			Name: "comments.list_pending", Description: "List pending or reported comments for moderation insight.",
			Parameters: schema(`{"reported_only":{"type":"boolean"},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "comment", OutputKeys: []string{"id"}}, Execute: tools.listPendingComments,
		},
		Definition{
			Name: "analytics.get_summary", Description: "Read the current blog analytics summary.",
			Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true}, Execute: tools.analyticsSummary,
		},
		Definition{
			Name: "analytics.list_low_engagement_posts", Description: "List published posts with sufficient views but a low likes-to-views ratio.",
			Parameters:     schema(`{"min_views":{"type":"integer","minimum":1,"maximum":1000000000},"max_engagement_rate":{"type":"number","minimum":0,"maximum":1},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Configuration:  schema(`{"min_views":{"type":"integer","minimum":1,"maximum":1000000000},"max_engagement_rate":{"type":"number","minimum":0,"maximum":1},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			DefaultBinding: json.RawMessage(`{"min_views":100,"max_engagement_rate":0.02,"limit":20}`),
			Risk:           domain.ToolRiskRead, Scope: &ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id", "post_id"}}, Execute: tools.findLowEngagementPosts,
		},
		Definition{
			Name: "content.propose_draft", Description: "Create a new blog draft proposal.",
			Parameters: schema(`{"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}`, "title", "content"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{AllowsCreate: true}, Propose: tools.proposeDraft,
		},
		Definition{
			Name: "content.propose_update", Description: "Propose changes to an existing blog post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}`, "id"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{ResourceType: "post", Argument: "id"}, Propose: tools.proposeUpdate,
		},
		Definition{
			Name: "content.propose_tags", Description: "Propose replacement tags for an existing post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"tags":{"type":"array","items":{"type":"string"}}}`, "id", "tags"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{ResourceType: "post", Argument: "id"}, Propose: tools.proposeTags,
		},
		Definition{
			Name: "comments.propose_reply", Description: "Create a reply draft for a comment.",
			Parameters: schema(`{"comment_id":{"type":"integer","minimum":1},"content":{"type":"string"}}`, "comment_id", "content"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{ResourceType: "comment", Argument: "comment_id"}, Propose: tools.proposeReply,
		},
		Definition{
			Name: "content.propose_task", Description: "Create an editorial task proposal.",
			Parameters: schema(`{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string","enum":["low","medium","high"]}}`, "title", "description"),
			Risk:       domain.ToolRiskPropose, Scope: &ScopeRule{AllowsCreate: true}, Propose: tools.proposeTask,
		},
		Definition{
			Name: "content.propose_distribution_draft", Description: "Create an approval-only social, newsletter, FAQ, or image brief from one post. It never sends content to an external service.",
			Parameters:     schema(`{"post_id":{"type":"integer","minimum":1},"format":{"type":"string","enum":["social","newsletter","faq","image_brief"]},"headline":{"type":"string","maxLength":500},"body":{"type":"string","maxLength":12000},"platform":{"type":"string","maxLength":100},"alt_text":{"type":"string","maxLength":500}}`, "post_id", "format", "body"),
			Configuration:  schema(`{"format":{"type":"string","enum":["social","newsletter","faq","image_brief"]},"platform":{"type":"string","maxLength":100}}`),
			DefaultBinding: json.RawMessage(`{"format":"social","platform":"Twitter"}`),
			Risk:           domain.ToolRiskPropose, Scope: &ScopeRule{ResourceType: "post", Argument: "post_id"}, Propose: tools.proposeDistributionDraft,
		},
		Definition{
			Name: "media.create_image_task", Description: "Create an internal image-generation task for one selected post. It does not modify or publish the post.",
			Parameters: schema(`{"post_id":{"type":"integer","minimum":1},"format":{"type":"string","enum":["image_brief"]},"headline":{"type":"string","maxLength":500},"body":{"type":"string","maxLength":12000},"platform":{"type":"string","maxLength":100},"alt_text":{"type":"string","maxLength":500}}`, "post_id", "format", "body"),
			Output:     json.RawMessage(`{"type":"object","properties":{"status":{"type":"string"},"candidate_id":{"type":"integer"},"workflow_run_id":{"type":"integer"}}}`),
			Surfaces:   []string{"agent"}, Risk: domain.ToolRiskWrite, Scope: &ScopeRule{ResourceType: "post", Argument: "post_id"},
		},
	)
}


func schema(properties string, required ...string) json.RawMessage {
	value := `{"type":"object","additionalProperties":false,"properties":` + properties
	if len(required) > 0 {
		raw, _ := json.Marshal(required)
		value += `,"required":` + string(raw)
	}
	value += `}`
	return json.RawMessage(value)
}

func decodeArguments(raw json.RawMessage, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidArgument, err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return ErrInvalidArgument
	}
	return nil
}

func (t *BlogTools) listPosts(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		Page     int `json:"page"`
		PageSize int `json:"page_size"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.Page <= 0 {
		args.Page = 1
	}
	if args.PageSize <= 0 {
		args.PageSize = 50
	}
	if args.PageSize > 100 {
		return nil, ErrInvalidArgument
	}
	posts, total, err := t.posts.ListAdminPosts(ctx, domain.AdminPostFilter{}, args.Page, args.PageSize)
	return map[string]any{"list": compactPosts(posts), "total": total}, err
}

func compactPosts(posts []*domain.Post) []map[string]any {
	result := make([]map[string]any, 0, len(posts))
	for _, post := range posts {
		result = append(result, map[string]any{
			"id": post.ID, "title": post.Title, "slug": post.Slug, "summary": post.Summary,
			"tags": post.Tags, "status": post.Status, "views_count": post.ViewsCount,
			"likes_count": post.LikesCount, "published_at": post.PublishedAt, "updated_at": post.UpdatedAt,
		})
	}
	return result
}

func (t *BlogTools) getPost(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	if len([]rune(post.Content)) > 50000 {
		post.Content = string([]rune(post.Content)[:50000])
	}
	return post, nil
}

func (t *BlogTools) searchPosts(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	args.Query = strings.TrimSpace(args.Query)
	if args.Query == "" {
		return nil, ErrInvalidArgument
	}
	if args.Limit <= 0 {
		args.Limit = 10
	}
	if args.Limit > 20 {
		return nil, ErrInvalidArgument
	}
	posts, total, err := t.posts.ListPosts(ctx, "", args.Query, 1, args.Limit)
	return map[string]any{"list": compactPosts(posts), "total": total}, err
}

func (t *BlogTools) listTags(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct{}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	return t.posts.ListTags(ctx)
}

func (t *BlogTools) listPendingComments(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ReportedOnly bool `json:"reported_only"`
		Limit        int  `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.Limit <= 0 {
		args.Limit = 50
	}
	if args.Limit > 100 {
		return nil, ErrInvalidArgument
	}
	comments, total, err := t.community.ListAdminComments(ctx, "pending", args.ReportedOnly, 1, args.Limit)
	if err != nil {
		return nil, err
	}
	for _, comment := range comments {
		comment.AuthorSubject = nil
	}
	return map[string]any{"list": comments, "total": total}, nil
}

func (t *BlogTools) analyticsSummary(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct{}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	return t.growth.AnalyticsSummary(ctx)
}

func (t *BlogTools) proposeDraft(_ context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		Title   string   `json:"title"`
		Slug    string   `json:"slug"`
		Summary string   `json:"summary"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := decodeArguments(raw, &args); err != nil ||
		strings.TrimSpace(args.Title) == "" || strings.TrimSpace(args.Content) == "" {
		return nil, ErrInvalidArgument
	}
	payload, _ := json.Marshal(args)
	return &Proposal{ActionType: "create_draft", TargetType: "post", Payload: payload}, nil
}

func (t *BlogTools) proposeReply(_ context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		CommentID int64  `json:"comment_id"`
		Content   string `json:"content"`
	}
	if err := decodeArguments(raw, &args); err != nil ||
		args.CommentID <= 0 || strings.TrimSpace(args.Content) == "" {
		return nil, ErrInvalidArgument
	}
	payload, _ := json.Marshal(args)
	return &Proposal{
		ActionType: "reply_comment", TargetType: "comment",
		TargetID: &args.CommentID, Payload: payload,
	}, nil
}

func (t *BlogTools) proposeTask(_ context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
	}
	if err := decodeArguments(raw, &args); err != nil ||
		strings.TrimSpace(args.Title) == "" || strings.TrimSpace(args.Description) == "" {
		return nil, ErrInvalidArgument
	}
	if args.Priority == "" {
		args.Priority = "medium"
	}
	if args.Priority != "low" && args.Priority != "medium" && args.Priority != "high" {
		return nil, ErrInvalidArgument
	}
	payload, _ := json.Marshal(args)
	return &Proposal{ActionType: "create_editorial_task", TargetType: "task", Payload: payload}, nil
}

// proposeDistributionDraft deliberately stops at an approval record.  There is
// no connector or delivery path behind this Tool: a reviewer can inspect and
// copy an approved draft, while a future connector must introduce its own
// OAuth, idempotency, and delivery approval boundary.
func (t *BlogTools) proposeDistributionDraft(ctx context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		PostID   int64  `json:"post_id"`
		Format   string `json:"format"`
		Headline string `json:"headline"`
		Body     string `json:"body"`
		Platform string `json:"platform"`
		AltText  string `json:"alt_text"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.PostID <= 0 {
		return nil, ErrInvalidArgument
	}
	args.Format = strings.TrimSpace(args.Format)
	args.Headline = strings.TrimSpace(args.Headline)
	args.Body = strings.TrimSpace(args.Body)
	args.Platform = strings.TrimSpace(args.Platform)
	args.AltText = strings.TrimSpace(args.AltText)
	if args.Body == "" || len([]rune(args.Headline)) > 500 || len([]rune(args.Body)) > 12000 || len([]rune(args.Platform)) > 100 || len([]rune(args.AltText)) > 500 {
		return nil, ErrInvalidArgument
	}
	switch args.Format {
	case "social", "newsletter", "faq", "image_brief":
	default:
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.PostID)
	if err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(args)
	before, _ := json.Marshal(post)
	return &Proposal{
		ActionType: "create_distribution_draft", TargetType: "post", TargetID: &args.PostID,
		Payload: payload, BeforeSnapshot: before,
	}, nil
}

func (t *BlogTools) proposeUpdate(ctx context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		ID      int64     `json:"id"`
		Title   *string   `json:"title"`
		Slug    *string   `json:"slug"`
		Summary *string   `json:"summary"`
		Content *string   `json:"content"`
		Tags    *[]string `json:"tags"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	if args.Title == nil && args.Slug == nil && args.Summary == nil && args.Content == nil && args.Tags == nil {
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	clean, _ := json.Marshal(struct {
		Title   *string   `json:"title,omitempty"`
		Slug    *string   `json:"slug,omitempty"`
		Summary *string   `json:"summary,omitempty"`
		Content *string   `json:"content,omitempty"`
		Tags    *[]string `json:"tags,omitempty"`
	}{args.Title, args.Slug, args.Summary, args.Content, args.Tags})
	before, _ := json.Marshal(post)
	return &Proposal{
		ActionType: "update_post", TargetType: "post", TargetID: &args.ID,
		Payload: clean, BeforeSnapshot: before,
	}, nil
}

func (t *BlogTools) proposeTags(ctx context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		ID   int64    `json:"id"`
		Tags []string `json:"tags"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 || len(args.Tags) == 0 {
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]any{"tags": args.Tags})
	before, _ := json.Marshal(post)
	return &Proposal{
		ActionType: "update_tags", TargetType: "post", TargetID: &args.ID,
		Payload: payload, BeforeSnapshot: before,
	}, nil
}

func (t *BlogTools) listPages(ctx context.Context, raw json.RawMessage) (any, error) {
	if t.pages == nil {
		return map[string]any{"list": []any{}, "total": 0}, nil
	}
	var args struct {
		Page     int `json:"page"`
		PageSize int `json:"page_size"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.Page <= 0 {
		args.Page = 1
	}
	if args.PageSize <= 0 {
		args.PageSize = 50
	}
	if args.PageSize > 100 {
		return nil, ErrInvalidArgument
	}
	pages, total, err := t.pages.ListAdminPages(ctx, domain.AdminPageFilter{}, args.Page, args.PageSize)
	return map[string]any{"list": compactPages(pages), "total": total}, err
}

func compactPages(pages []*domain.Page) []map[string]any {
	result := make([]map[string]any, 0, len(pages))
	for _, page := range pages {
		result = append(result, map[string]any{
			"id": page.ID, "title": page.Title, "slug": page.Slug, "summary": page.Summary,
			"template": page.Template, "status": page.Status, "show_in_nav": page.ShowInNav,
			"allow_comments": page.AllowComments, "sort_order": page.SortOrder,
			"seo_title": page.SEOTitle, "seo_description": page.SEODescription,
			"created_at": page.CreatedAt, "updated_at": page.UpdatedAt,
		})
	}
	return result
}

func (t *BlogTools) getPage(ctx context.Context, raw json.RawMessage) (any, error) {
	if t.pages == nil {
		return nil, ErrInvalidArgument
	}
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	page, err := t.pages.GetPage(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	if len([]rune(page.Content)) > 50000 {
		page.Content = string([]rune(page.Content)[:50000])
	}
	return page, nil
}

func (t *BlogTools) proposePageDraft(_ context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		Title          string `json:"title"`
		Slug           string `json:"slug"`
		Summary        string `json:"summary"`
		Content        string `json:"content"`
		Template       string `json:"template"`
		ShowInNav      bool   `json:"show_in_nav"`
		AllowComments  bool   `json:"allow_comments"`
		SortOrder      int    `json:"sort_order"`
		SEOTitle       string `json:"seo_title"`
		SEODescription string `json:"seo_description"`
	}
	if err := decodeArguments(raw, &args); err != nil ||
		strings.TrimSpace(args.Title) == "" || strings.TrimSpace(args.Slug) == "" {
		return nil, ErrInvalidArgument
	}
	payload, _ := json.Marshal(args)
	return &Proposal{ActionType: "create_page_draft", TargetType: "page", Payload: payload}, nil
}

func (t *BlogTools) proposePageUpdate(ctx context.Context, raw json.RawMessage) (*Proposal, error) {
	if t.pages == nil {
		return nil, ErrInvalidArgument
	}
	var args struct {
		ID             int64   `json:"id"`
		Title          *string `json:"title"`
		Slug           *string `json:"slug"`
		Summary        *string `json:"summary"`
		Content        *string `json:"content"`
		Template       *string `json:"template"`
		Status         *string `json:"status"`
		ShowInNav      *bool   `json:"show_in_nav"`
		AllowComments  *bool   `json:"allow_comments"`
		SortOrder      *int    `json:"sort_order"`
		SEOTitle       *string `json:"seo_title"`
		SEODescription *string `json:"seo_description"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	if args.Title == nil && args.Slug == nil && args.Summary == nil && args.Content == nil &&
		args.Template == nil && args.Status == nil && args.ShowInNav == nil && args.AllowComments == nil &&
		args.SortOrder == nil && args.SEOTitle == nil && args.SEODescription == nil {
		return nil, ErrInvalidArgument
	}
	page, err := t.pages.GetPage(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	clean, _ := json.Marshal(struct {
		Title          *string `json:"title,omitempty"`
		Slug           *string `json:"slug,omitempty"`
		Summary        *string `json:"summary,omitempty"`
		Content        *string `json:"content,omitempty"`
		Template       *string `json:"template,omitempty"`
		Status         *string `json:"status,omitempty"`
		ShowInNav      *bool   `json:"show_in_nav,omitempty"`
		AllowComments  *bool   `json:"allow_comments,omitempty"`
		SortOrder      *int    `json:"sort_order,omitempty"`
		SEOTitle       *string `json:"seo_title,omitempty"`
		SEODescription *string `json:"seo_description,omitempty"`
	}{args.Title, args.Slug, args.Summary, args.Content, args.Template, args.Status, args.ShowInNav, args.AllowComments, args.SortOrder, args.SEOTitle, args.SEODescription})
	before, _ := json.Marshal(page)
	return &Proposal{
		ActionType: "update_page", TargetType: "page", TargetID: &args.ID,
		Payload: clean, BeforeSnapshot: before,
	}, nil
}
