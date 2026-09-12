package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestRepositoryRelatedPosts(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	slug := fmt.Sprintf("recommendation-source-%d", suffix)
	relatedSlug := fmt.Sprintf("recommendation-related-%d", suffix)

	var postID, relatedID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Source title', $1, 'Summary', 'Body', ARRAY['go', 'testing'], 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Related title', $1, 'Related summary', 'Related body', ARRAY['go'], 'published', NOW()) RETURNING id`, relatedSlug).Scan(&relatedID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id IN ($1, $2)`, postID, relatedID)

	related, err := New(db).RelatedPosts(ctx, postID, []string{"go", "testing"}, 4)
	if err != nil || len(related) == 0 || related[0].ID != relatedID {
		t.Fatalf("expected related post, posts=%#v err=%v", related, err)
	}
}
