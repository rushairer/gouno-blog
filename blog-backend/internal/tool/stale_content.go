package tool

import (
	"context"
	"encoding/json"
	"time"
)

func (t *BlogTools) findStalePosts(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		OlderThanDays int `json:"older_than_days"`
		Limit         int `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.OlderThanDays <= 0 {
		args.OlderThanDays = 180
	}
	if args.OlderThanDays < 1 || args.OlderThanDays > 3650 {
		return nil, ErrInvalidArgument
	}
	if args.Limit <= 0 {
		args.Limit = 20
	}
	if args.Limit > 100 {
		return nil, ErrInvalidArgument
	}
	posts, err := t.posts.ListStalePublishedPosts(ctx, time.Duration(args.OlderThanDays)*24*time.Hour, args.Limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"older_than_days": args.OlderThanDays,
		"list":            compactPosts(posts),
		"total":           len(posts),
	}, nil
}
