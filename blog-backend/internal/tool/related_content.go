package tool

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

type relatedContentSuggestion struct {
	PostID        int64    `json:"post_id"`
	Title         string   `json:"title"`
	Slug          string   `json:"slug"`
	Summary       string   `json:"summary"`
	Snippet       string   `json:"snippet"`
	Score         float64  `json:"score"`
	Tags          []string `json:"tags"`
	CitationID    string   `json:"citation_id,omitempty"`
	ChunkID       int64    `json:"chunk_id,omitempty"`
	StartOffset   int      `json:"start_offset,omitempty"`
	EndOffset     int      `json:"end_offset,omitempty"`
	LexicalScore  float64  `json:"lexical_score,omitempty"`
	SemanticScore float64  `json:"semantic_score,omitempty"`
}

func (t *BlogTools) findRelatedContent(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID    int64  `json:"id"`
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	if args.Limit <= 0 {
		args.Limit = 5
	}
	if args.Limit > 10 {
		return nil, ErrInvalidArgument
	}
	source, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	query := strings.TrimSpace(args.Query)
	if query == "" {
		query = relatedQuery(source)
	}
	if t.knowledge != nil {
		results, err := t.knowledge.Search(ctx, query, args.Limit, source.ID)
		if err != nil {
			return nil, err
		}
		suggestions := make([]relatedContentSuggestion, 0, len(results))
		for _, result := range results {
			suggestions = append(suggestions, relatedContentSuggestion{
				PostID: result.PostID, Title: result.Title, Slug: result.Slug, Snippet: result.Snippet,
				Score: result.Score, CitationID: result.CitationID, ChunkID: result.ChunkID,
				StartOffset: result.StartOffset, EndOffset: result.EndOffset,
				LexicalScore: result.LexicalScore, SemanticScore: result.SemanticScore,
			})
		}
		return map[string]any{"post_id": source.ID, "query": query, "suggestions": suggestions}, nil
	}
	if query == "" {
		return map[string]any{"post_id": source.ID, "query": "", "suggestions": []relatedContentSuggestion{}}, nil
	}
	results, err := t.posts.SearchPublishedPosts(ctx, query, args.Limit+1)
	if err != nil {
		return nil, err
	}
	suggestions := make([]relatedContentSuggestion, 0, args.Limit)
	for _, result := range results {
		if result.Post == nil || result.Post.ID == source.ID {
			continue
		}
		suggestions = append(suggestions, relatedContentSuggestion{
			PostID: result.Post.ID, Title: result.Post.Title, Slug: result.Post.Slug, Summary: result.Post.Summary,
			Snippet: result.Snippet, Score: result.Score, Tags: result.Post.Tags,
		})
		if len(suggestions) == args.Limit {
			break
		}
	}
	return map[string]any{"post_id": source.ID, "query": query, "suggestions": suggestions}, nil
}

func (t *BlogTools) searchKnowledge(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil || strings.TrimSpace(args.Query) == "" {
		return nil, ErrInvalidArgument
	}
	if t.knowledge == nil {
		return map[string]any{"query": args.Query, "suggestions": []any{}}, nil
	}
	items, err := t.knowledge.Search(ctx, args.Query, args.Limit, 0)
	if err != nil {
		return nil, err
	}
	return map[string]any{"query": args.Query, "suggestions": items}, nil
}

func relatedQuery(post *domain.Post) string {
	if post == nil {
		return ""
	}
	parts := make([]string, 0, len(post.Tags)+1)
	if title := strings.TrimSpace(post.Title); title != "" {
		parts = append(parts, title)
	}
	for _, tag := range post.Tags {
		if tag = strings.TrimSpace(tag); tag != "" {
			parts = append(parts, tag)
		}
	}
	query := strings.Join(parts, " ")
	if len([]rune(query)) > 500 {
		return string([]rune(query)[:500])
	}
	return query
}
