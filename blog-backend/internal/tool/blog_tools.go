package tool

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
)

type BlogTools struct {
	posts      *service.PostService
	community  *service.CommunityService
	growth     *service.GrowthService
	linkClient linkHTTPClient
}

func NewBlogRegistry(posts *service.PostService, community *service.CommunityService, growth *service.GrowthService) *Registry {
	tools := &BlogTools{
		posts: posts, community: community, growth: growth,
		linkClient: newSafeLinkClient(),
	}
	return New(
		Definition{
			Name: "content.list_posts", Description: "List blog posts, including drafts and scheduled posts.",
			Parameters: schema(`{"page":{"type":"integer","minimum":1},"page_size":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Execute: tools.listPosts,
		},
		Definition{
			Name: "content.get_post", Description: "Read one blog post by numeric ID.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Execute: tools.getPost,
		},
		Definition{
			Name: "content.search_posts", Description: "Search published blog posts by title, summary, or content.",
			Parameters: schema(`{"query":{"type":"string","minLength":1},"limit":{"type":"integer","minimum":1,"maximum":20}}`, "query"),
			Risk:       domain.ToolRiskRead, Execute: tools.searchPosts,
		},
		Definition{
			Name: "content.list_tags", Description: "List all blog tags.",
			Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Execute: tools.listTags,
		},
		Definition{
			Name: "content.check_links", Description: "Check public HTTP(S) links found in one post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Execute: tools.checkLinks,
		},
		Definition{
			Name: "content.audit_post", Description: "Run deterministic content-quality checks for a draft, scheduled, or published post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1}}`, "id"),
			Risk:       domain.ToolRiskRead, Execute: tools.auditPost,
		},
		Definition{
			Name: "content.find_internal_links", Description: "Suggest relevant published posts that are not already linked from one post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"limit":{"type":"integer","minimum":1,"maximum":10}}`, "id"),
			Risk:       domain.ToolRiskRead, Execute: tools.findInternalLinks,
		},
		Definition{
			Name: "content.find_related", Description: "Search published posts related to one post and return relevance-ranked evidence snippets.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"query":{"type":"string","minLength":1},"limit":{"type":"integer","minimum":1,"maximum":10}}`, "id"),
			Risk:       domain.ToolRiskRead, Execute: tools.findRelatedContent,
		},
		Definition{
			Name: "content.list_stale_posts", Description: "List published posts that have not been updated for a chosen number of days.",
			Parameters: schema(`{"older_than_days":{"type":"integer","minimum":1,"maximum":3650},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Execute: tools.findStalePosts,
		},
		Definition{
			Name: "comments.list_pending", Description: "List pending or reported comments for moderation insight.",
			Parameters: schema(`{"reported_only":{"type":"boolean"},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Execute: tools.listPendingComments,
		},
		Definition{
			Name: "analytics.get_summary", Description: "Read the current blog analytics summary.",
			Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Execute: tools.analyticsSummary,
		},
		Definition{
			Name: "content.propose_draft", Description: "Create a new blog draft proposal.",
			Parameters: schema(`{"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}`, "title", "content"),
			Risk:       domain.ToolRiskPropose, Propose: tools.proposeDraft,
		},
		Definition{
			Name: "content.propose_update", Description: "Propose changes to an existing blog post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}`, "id"),
			Risk:       domain.ToolRiskPropose, Propose: tools.proposeUpdate,
		},
		Definition{
			Name: "content.propose_tags", Description: "Propose replacement tags for an existing post.",
			Parameters: schema(`{"id":{"type":"integer","minimum":1},"tags":{"type":"array","items":{"type":"string"}}}`, "id", "tags"),
			Risk:       domain.ToolRiskPropose, Propose: tools.proposeTags,
		},
		Definition{
			Name: "comments.propose_reply", Description: "Create a reply draft for a comment.",
			Parameters: schema(`{"comment_id":{"type":"integer","minimum":1},"content":{"type":"string"}}`, "comment_id", "content"),
			Risk:       domain.ToolRiskPropose, Propose: tools.proposeReply,
		},
		Definition{
			Name: "content.propose_task", Description: "Create an editorial task proposal.",
			Parameters: schema(`{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string","enum":["low","medium","high"]}}`, "title", "description"),
			Risk:       domain.ToolRiskPropose, Propose: tools.proposeTask,
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
