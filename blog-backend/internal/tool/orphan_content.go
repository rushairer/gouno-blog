package tool

import (
	"context"
	"encoding/json"
)

func (t *BlogTools) findOrphanPosts(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		Limit int `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.Limit <= 0 {
		args.Limit = 20
	}
	if args.Limit > 100 {
		return nil, ErrInvalidArgument
	}
	posts, err := t.posts.ListOrphanedPublishedPosts(ctx, args.Limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"match_rule": "no relative /articles/:slug or /posts/:slug link found in another published article",
		"list":       compactPosts(posts),
		"total":      len(posts),
	}, nil
}
