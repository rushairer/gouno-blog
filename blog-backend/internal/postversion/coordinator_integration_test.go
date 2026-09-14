package postversion

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/dbtx"
	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
	postversionrepository "github.com/rushairer/blog-backend/internal/postversion/repository"
	"github.com/rushairer/blog-backend/internal/testsupport"
	"go.uber.org/zap"
)

func TestRestoreCoordinatorKeepsVersionReadAndPostWriteAtomic(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	slug := fmt.Sprintf("postversion-coordinator-%d", time.Now().UnixNano())

	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Original title', $1, 'Summary', 'Original body', ARRAY['go', 'testing'], 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID)

	if _, err := db.ExecContext(ctx, `UPDATE posts SET title = 'Updated title', content = 'Updated body' WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}

	versions := postversionrepository.New(db)
	items, err := versions.ListVersions(ctx, postID)
	if err != nil || len(items) != 1 {
		t.Fatalf("versions=%#v err=%v", items, err)
	}
	posts := postrepository.NewPostRepository(db)
	coordinator := NewRestoreCoordinator(dbtx.NewTransactor(db, zap.NewNop()), versions, posts)
	restored, err := coordinator.RestoreVersion(ctx, postID, items[0].ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Title != "Original title" || restored.Content != "Original body" {
		t.Fatalf("restore mismatch: %#v", restored)
	}

	var title, content string
	if err := db.QueryRowContext(ctx, `SELECT title, content FROM posts WHERE id = $1`, postID).Scan(&title, &content); err != nil {
		t.Fatal(err)
	}
	if title != "Original title" || content != "Original body" {
		t.Fatalf("persisted restore mismatch: title=%q content=%q", title, content)
	}
}
