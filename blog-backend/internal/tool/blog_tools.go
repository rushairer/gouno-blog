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
	posts     *service.PostService
	community *service.CommunityService
	growth    *service.GrowthService
}

func NewBlogRegistry(posts *service.PostService, community *service.CommunityService, growth *service.GrowthService) *Registry {
	tools := &BlogTools{posts: posts, community: community, growth: growth}
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
			Name: "comments.list_pending", Description: "List pending or reported comments for moderation insight.",
			Parameters: schema(`{"reported_only":{"type":"boolean"},"limit":{"type":"integer","minimum":1,"maximum":100}}`),
			Risk:       domain.ToolRiskRead, Execute: tools.listPendingComments,
		},
		Definition{
			Name: "analytics.get_summary", Description: "Read the current blog analytics summary.",
			Parameters: schema(`{}`), Risk: domain.ToolRiskRead, Execute: tools.analyticsSummary,
		},
		proposalDefinition("content.propose_draft", "Create a new blog draft proposal.", "create_draft", "post", nil,
			schema(`{"title":{"type":"string"},"slug":{"type":"string"},"summary":{"type":"string"},"content":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}}}`, "title", "content")),
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
		proposalDefinition("comments.propose_reply", "Create a reply draft for a comment.", "reply_comment", "comment", nil,
			schema(`{"comment_id":{"type":"integer","minimum":1},"content":{"type":"string"}}`, "comment_id", "content")),
		proposalDefinition("content.propose_task", "Create an editorial task proposal.", "create_editorial_task", "task", nil,
			schema(`{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"}}`, "title", "description")),
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
	posts, total, err := t.posts.ListAdminPosts(ctx, args.Page, args.PageSize)
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
	post, err := t.posts.GetPost(ctx, args.ID)
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

func proposalDefinition(name, description, actionType, targetType string, targetID *int64, parameters json.RawMessage) Definition {
	return Definition{
		Name: name, Description: description, Parameters: parameters, Risk: domain.ToolRiskPropose,
		Propose: func(_ context.Context, raw json.RawMessage) (*Proposal, error) {
			var payload map[string]any
			if err := decodeArguments(raw, &payload); err != nil {
				return nil, err
			}
			return &Proposal{
				ActionType: actionType, TargetType: targetType, TargetID: targetID, Payload: raw,
			}, nil
		},
	}
}

func (t *BlogTools) proposeUpdate(ctx context.Context, raw json.RawMessage) (*Proposal, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, ErrInvalidArgument
	}
	number, ok := payload["id"].(float64)
	if !ok || number <= 0 {
		return nil, ErrInvalidArgument
	}
	args.ID = int64(number)
	post, err := t.posts.GetPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	delete(payload, "id")
	clean, _ := json.Marshal(payload)
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
	post, err := t.posts.GetPost(ctx, args.ID)
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
