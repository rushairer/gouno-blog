package migrations

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
)

func TestUpAppliesCurrentSchemaAndIsIdempotent(t *testing.T) {
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
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatalf("second migration run must be idempotent: %v", err)
	}
	for _, table := range []string{
		"post_reactions", "bookmarks", "comment_reports", "notifications", "post_versions",
		"media_assets", "analytics_events", "ai_provider_profiles", "ai_agents",
		"ai_agent_runs", "ai_tool_calls", "ai_approvals", "ai_usage_events",
		"ai_editorial_tasks", "ai_comment_reply_drafts",
	} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, "public."+table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("expected table %s to exist", table)
		}
	}
	var providerSoftDelete bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema='public' AND table_name='ai_provider_profiles' AND column_name='deleted_at'
	)`).Scan(&providerSoftDelete); err != nil {
		t.Fatal(err)
	}
	if !providerSoftDelete {
		t.Fatal("expected ai_provider_profiles.deleted_at to exist")
	}
}
