package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestRepositoryRecordsEventsAndBuildsSummary(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	slug := fmt.Sprintf("analytics-integration-%d", suffix)
	secondSlug := fmt.Sprintf("analytics-secondary-%d", suffix)

	var postID, secondID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Analytics post', $1, 'Summary', 'Body', ARRAY['analytics'], 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Analytics secondary', $1, 'Summary', 'Body', ARRAY['analytics'], 'published', NOW()) RETURNING id`, secondSlug).Scan(&secondID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM analytics_events WHERE post_id IN ($1, $2)`, postID, secondID)
		_, _ = db.ExecContext(ctx, `DELETE FROM posts WHERE id IN ($1, $2)`, postID, secondID)
	}()

	repo := New(db)
	if err := repo.RecordEvent(ctx, postID, "view", fmt.Sprintf("analytics-visitor-%d", suffix)); err != nil {
		t.Fatal(err)
	}
	if err := repo.RecordEvent(ctx, secondID, "non-view", fmt.Sprintf("analytics-secondary-visitor-%d", suffix)); err != nil {
		t.Fatal(err)
	}

	var views, secondViews int64
	if err := db.QueryRowContext(ctx, `SELECT views_count FROM posts WHERE id = $1`, postID).Scan(&views); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT views_count FROM posts WHERE id = $1`, secondID).Scan(&secondViews); err != nil {
		t.Fatal(err)
	}
	if views != 1 {
		t.Fatalf("view event views_count=%d, want 1", views)
	}
	if secondViews != 0 {
		t.Fatalf("non-view event views_count=%d, want 0", secondViews)
	}

	summary, err := repo.AnalyticsSummary(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalPosts < 2 || summary.PublishedPosts < 2 {
		t.Fatalf("unexpected post totals: %#v", summary)
	}
	if len(summary.DailyEvents) != 14 {
		t.Fatalf("daily event series length=%d, want 14", len(summary.DailyEvents))
	}
	if len(summary.TopPosts) == 0 {
		t.Fatalf("analytics summary has no top posts: %#v", summary)
	}
}
