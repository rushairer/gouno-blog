package workflow

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/migrations"
)

func TestResourceCatalogResolvesRequestedKeys(t *testing.T) {
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := migrations.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	slug := fmt.Sprintf("workflow-resource-lookup-%d", time.Now().UnixNano())
	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,content,status) VALUES('Resource lookup', $1, 'body', 'draft') RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id=$1`, postID)

	items, total, err := NewResourceCatalog(db).List(ctx, "post", domain.ResourceQuery{
		Keys: []string{fmt.Sprint(postID), fmt.Sprint(postID), "999999999999"}, Filters: map[string]string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(items) != 1 || items[0].Key != fmt.Sprint(postID) || items[0].Label != "Resource lookup" {
		t.Fatalf("resolved resources: total=%d items=%#v", total, items)
	}
}

func TestResourceCatalogRejectsOversizedKeyLookup(t *testing.T) {
	keys := make([]string, 101)
	for index := range keys {
		keys[index] = fmt.Sprint(index + 1)
	}
	_, _, err := NewResourceCatalog(nil).List(context.Background(), "post", domain.ResourceQuery{Keys: keys, Filters: map[string]string{}})
	if err == nil {
		t.Fatal("resource lookup over 100 keys should be rejected")
	}
}
