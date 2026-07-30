package tool

import (
	"context"
	"encoding/json"
)

func (t *BlogTools) findLowEngagementPosts(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		MinViews          int64    `json:"min_views"`
		MaxEngagementRate *float64 `json:"max_engagement_rate"`
		Limit             int      `json:"limit"`
	}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	if args.MinViews <= 0 {
		args.MinViews = 100
	}
	maxRate := 0.02
	if args.MaxEngagementRate != nil {
		maxRate = *args.MaxEngagementRate
	}
	if args.MinViews < 1 || args.MinViews > 1000000000 || maxRate < 0 || maxRate > 1 {
		return nil, ErrInvalidArgument
	}
	if args.Limit <= 0 {
		args.Limit = 20
	}
	if args.Limit > 100 {
		return nil, ErrInvalidArgument
	}
	posts, err := t.posts.ListLowEngagementPublishedPosts(ctx, args.MinViews, maxRate, args.Limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"min_views":           args.MinViews,
		"max_engagement_rate": maxRate,
		"list":                compactPosts(posts),
		"total":               len(posts),
	}, nil
}
