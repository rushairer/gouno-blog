package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestFindStalePostsValidatesBoundedArguments(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	_, _, _, err := registry.Invoke(context.Background(), []string{"content.list_stale_posts"}, "content.list_stale_posts", json.RawMessage(`{"older_than_days":3651}`))
	if !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("err = %v", err)
	}
}
