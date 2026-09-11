package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestSiteRepositoryOwnsSettingsPersistence(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	repo := New(db)

	before, err := repo.GetSiteSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	originalDescription := before["site_description"]
	defer func() {
		_, _ = repo.UpdateSiteSettings(context.Background(), map[string]string{"site_description": originalDescription})
	}()

	want := fmt.Sprintf("site ownership integration %d", time.Now().UnixNano())
	after, err := repo.UpdateSiteSettings(ctx, map[string]string{"site_description": want})
	if err != nil {
		t.Fatal(err)
	}
	if after["site_description"] != want {
		t.Fatalf("site_description=%q, want %q", after["site_description"], want)
	}

	loaded, err := repo.GetSiteSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if loaded["site_description"] != want {
		t.Fatalf("persisted site_description=%q, want %q", loaded["site_description"], want)
	}
}
