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
		"ai_embedding_profiles", "ai_content_index_jobs", "ai_content_chunks",
		"ai_retrieval_metrics", "ai_retrieval_eval_cases",
		"ai_skill_versions",
		"ai_workflows", "ai_workflow_versions", "ai_workflow_runs", "ai_workflow_step_runs",
		"ai_link_health_jobs", "ai_link_health_snapshots",
		"ai_operational_suggestions",
		"ai_content_candidate_sets", "ai_content_candidates", "ai_feedback",
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
	var providerSecretNullable bool
	if err := db.QueryRowContext(ctx, `SELECT bool_and(is_nullable = 'YES')
		FROM information_schema.columns
		WHERE table_schema='public' AND table_name='ai_provider_profiles'
		AND column_name IN ('api_key_ciphertext', 'api_key_nonce')`).Scan(&providerSecretNullable); err != nil {
		t.Fatal(err)
	}
	if !providerSecretNullable {
		t.Fatal("expected deleted provider credentials to be nullable for revocation")
	}
	for _, trigger := range []string{"posts_search_document_update", "ai_content_chunks_search_vector_update"} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM pg_trigger WHERE tgname=$1 AND NOT tgisinternal
		)`, trigger).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("expected search document trigger %s to exist", trigger)
		}
	}
}
