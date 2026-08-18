package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestFindLowEngagementPostsRejectsInvalidRate(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	_, _, _, err := registry.Invoke(context.Background(), []string{"analytics.list_low_engagement_posts"}, "analytics.list_low_engagement_posts", json.RawMessage(`{"max_engagement_rate":1.1}`))
	if !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("err = %v", err)
	}
}
