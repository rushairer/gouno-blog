package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestPostVersionRepositoryLifecycle(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	slug := fmt.Sprintf("postversion-integration-%d", time.Now().UnixNano())

	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Original title', $1, 'Summary', 'Original body', ARRAY['go', 'testing'], 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID)

	if _, err := db.ExecContext(ctx, `UPDATE posts SET title = 'Updated title', content = 'Updated body' WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}

	repo := New(db)
	versions, err := repo.ListVersions(ctx, postID)
	if err != nil || len(versions) != 1 || versions[0].Title != "Original title" {
		t.Fatalf("version snapshot mismatch: versions=%#v err=%v", versions, err)
	}

	restored, err := repo.RestoreVersion(ctx, postID, versions[0].ID)
	if err != nil || restored.Title != "Original title" || restored.Content != "Original body" {
		t.Fatalf("restore mismatch: post=%#v err=%v", restored, err)
	}
}
