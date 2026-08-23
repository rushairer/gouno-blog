package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestGrowthRepositoryContentLifecycle(t *testing.T) {
	db := communityTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	slug := fmt.Sprintf("growth-integration-%d", suffix)
	relatedSlug := fmt.Sprintf("growth-related-%d", suffix)

	var postID, relatedID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Original title', $1, 'Summary', 'Original body', ARRAY['go', 'testing'], 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Related title', $1, 'Related summary', 'Related body', ARRAY['go'], 'published', NOW()) RETURNING id`, relatedSlug).Scan(&relatedID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id IN ($1, $2)`, postID, relatedID)

	repo := NewGrowthRepository(db)
	related, err := repo.RelatedPosts(ctx, postID, []string{"go", "testing"}, 4)
	if err != nil || len(related) == 0 || related[0].ID != relatedID {
		t.Fatalf("expected related post, posts=%#v err=%v", related, err)
	}

	if _, err := db.ExecContext(ctx, `UPDATE posts SET title = 'Updated title', content = 'Updated body' WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	versions, err := repo.ListVersions(ctx, postID)
	if err != nil || len(versions) != 1 || versions[0].Title != "Original title" {
		t.Fatalf("version snapshot mismatch: versions=%#v err=%v", versions, err)
	}
	restored, err := repo.RestoreVersion(ctx, postID, versions[0].ID)
	if err != nil || restored.Title != "Original title" || restored.Content != "Original body" {
		t.Fatalf("restore mismatch: post=%#v err=%v", restored, err)
	}

	creator := "integration-admin"
	asset := &domain.MediaAsset{
		Filename: "test.png", StorageName: fmt.Sprintf("test-%d.png", suffix), URL: "/media/test.png",
		ContentType: "image/png", SizeBytes: 128, AltText: "Test image", CreatedBy: &creator,
	}
	if err := repo.CreateMedia(ctx, asset); err != nil {
		t.Fatal(err)
	}
	assets, err := repo.ListMedia(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range assets {
		if item.ID == asset.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created media was not listed")
	}
	updatedAsset, err := repo.UpdateMediaAltText(ctx, asset.ID, "Updated alt text")
	if err != nil || updatedAsset.AltText != "Updated alt text" {
		t.Fatalf("update alt text failed: asset=%#v err=%v", updatedAsset, err)
	}
	if _, err := repo.DeleteMedia(ctx, asset.ID); err != nil {
		t.Fatal(err)
	}

	if err := repo.RecordEvent(ctx, postID, "view", "hashed-visitor"); err != nil {
		t.Fatal(err)
	}
	summary, err := repo.AnalyticsSummary(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalPosts < 2 || len(summary.DailyEvents) != 14 || len(summary.TopPosts) == 0 {
		t.Fatalf("analytics summary incomplete: %#v", summary)
	}
}
