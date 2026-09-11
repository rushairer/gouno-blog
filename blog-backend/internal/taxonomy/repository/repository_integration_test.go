package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestTaxonomyRepositoryOwnsCategoryAndTagPersistence(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := time.Now().UnixNano()

	repo := New(db)
	category := &domain.Category{
		Name:        fmt.Sprintf("Architecture %d", suffix),
		Slug:        fmt.Sprintf("architecture-%d", suffix),
		Description: "taxonomy ownership integration",
		SortOrder:   900,
	}
	if err := repo.CreateCategory(ctx, category); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM categories WHERE id = $1`, category.ID)

	loaded, err := repo.GetCategoryBySlug(ctx, category.Slug)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ID != category.ID || loaded.Name != category.Name {
		t.Fatalf("loaded category mismatch: %#v", loaded)
	}

	sourceTag := fmt.Sprintf("source-%d", suffix)
	targetTag := fmt.Sprintf("target-%d", suffix)
	var postID int64
	if err := db.QueryRowContext(ctx, `
		INSERT INTO posts (title, slug, summary, content, tags, category_id, status, published_at)
		VALUES ($1, $2, '', 'Body', ARRAY[$3, $4], $5, 'published', NOW())
		RETURNING id`,
		"Taxonomy integration", fmt.Sprintf("taxonomy-integration-%d", suffix), sourceTag, targetTag, category.ID,
	).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID)

	posts, total, err := repo.ListCategoryPosts(ctx, category.ID, 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 1 || len(posts) != 1 || posts[0].ID != postID {
		t.Fatalf("category posts mismatch: total=%d posts=%#v", total, posts)
	}

	renamedTag := fmt.Sprintf("renamed-%d", suffix)
	if err := repo.RenameTag(ctx, sourceTag, renamedTag); err != nil {
		t.Fatal(err)
	}
	tags, err := repo.ListAdminTags(ctx)
	if err != nil {
		t.Fatal(err)
	}
	foundRenamed := false
	for _, tag := range tags {
		if tag.Name == renamedTag {
			foundRenamed = true
			break
		}
	}
	if !foundRenamed {
		t.Fatalf("renamed tag %q not found in %#v", renamedTag, tags)
	}

	if err := repo.MergeTags(ctx, renamedTag, targetTag); err != nil {
		t.Fatal(err)
	}
	if err := repo.DeleteTag(ctx, targetTag); err != nil {
		t.Fatal(err)
	}
}
