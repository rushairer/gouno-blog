package repository

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestRepositoryMediaLifecycle(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	repo := New(db)
	asset := &domain.MediaAsset{
		Filename:    "ownership.png",
		StorageName: fmt.Sprintf("ownership-%d.png", suffix),
		URL:         fmt.Sprintf("/media/ownership-%d.png", suffix),
		ContentType: "image/png",
		SizeBytes:   128,
		AltText:     "Ownership test",
	}
	if err := repo.CreateMedia(ctx, asset); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM media_assets WHERE id = $1`, asset.ID)

	got, err := repo.GetMedia(ctx, asset.ID)
	if err != nil || got.StorageName != asset.StorageName || got.UsageCount != 0 {
		t.Fatalf("get media mismatch: asset=%#v err=%v", got, err)
	}

	assets, err := repo.ListMedia(ctx, domain.MediaFilter{})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range assets {
		if item.ID == asset.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("created media was not listed")
	}

	updated, err := repo.UpdateMediaAltText(ctx, asset.ID, "Updated alt text", nil)
	if err != nil || updated.AltText != "Updated alt text" {
		t.Fatalf("update alt text failed: asset=%#v err=%v", updated, err)
	}

	count, err := repo.CountMediaReferences(ctx, asset.ID)
	if err != nil || count != 0 {
		t.Fatalf("unexpected initial references: count=%d err=%v", count, err)
	}

	slug := fmt.Sprintf("media-reference-%d", suffix)
	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, tags, status, published_at)
		VALUES ('Media reference', $1, 'Summary', $2, ARRAY[]::text[], 'published', NOW()) RETURNING id`, slug, "Image: "+asset.URL).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID)

	count, err = repo.CountMediaReferences(ctx, asset.ID)
	if err != nil || count != 1 {
		t.Fatalf("expected one reference: count=%d err=%v", count, err)
	}
	references, err := repo.ListMediaReferences(ctx, asset.ID)
	if err != nil || len(references) != 1 || references[0].PostID != postID {
		t.Fatalf("media references mismatch: references=%#v err=%v", references, err)
	}
	if _, err := repo.DeleteMedia(ctx, asset.ID); !errors.Is(err, ErrMediaInUse) {
		t.Fatalf("delete referenced media error=%v, want ErrMediaInUse", err)
	}

	if _, err := db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	deleted, err := repo.DeleteMedia(ctx, asset.ID)
	if err != nil || deleted.ID != asset.ID || deleted.StorageName != asset.StorageName {
		t.Fatalf("delete media mismatch: asset=%#v err=%v", deleted, err)
	}
}
