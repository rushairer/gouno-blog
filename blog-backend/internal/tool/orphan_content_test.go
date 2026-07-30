package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestFindOrphanPostsRejectsOversizedLimit(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil)
	_, _, _, err := registry.Invoke(context.Background(), []string{"content.list_orphan_posts"}, "content.list_orphan_posts", json.RawMessage(`{"limit":101}`))
	if !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("err = %v", err)
	}
}
