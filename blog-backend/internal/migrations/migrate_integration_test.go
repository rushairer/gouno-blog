package migrations

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/repository"
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
	// Domain writes exercise the actual trigger body. Merely asserting that a
	// trigger exists would not catch ambiguous PL/pgSQL variable/column names.
	var triggerProbePostID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
		VALUES('Migration trigger probe','migration-trigger-probe-' || md5(random()::text || clock_timestamp()::text),'','probe','draft')
		RETURNING id`).Scan(&triggerProbePostID); err != nil {
		t.Fatalf("post domain-event trigger must accept inserts: %v", err)
	}
	var triggerProbeEvents int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_events
		WHERE payload->>'post_id'=$1::text`, triggerProbePostID).Scan(&triggerProbeEvents); err != nil {
		t.Fatal(err)
	}
	if triggerProbeEvents != 1 {
		t.Fatalf("expected one post domain event, got %d", triggerProbeEvents)
	}
	// A real fresh install runs migrations before an administrator can save a
	// Provider. Reproduce that order, then verify the second-stage bootstrap
	// completes every Provider-dependent Agent and Workflow binding.
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_provider_profiles
		(name,provider_type,base_url,model,api_key_ciphertext,api_key_nonce,api_key_last4,key_version,
		 enabled,is_default_writing,request_timeout_seconds,max_output_tokens)
		VALUES('fresh-install-writing','openai','https://provider.example.test','test-model',
		 '\\x01','\\x02','test',1,TRUE,TRUE,60,1024)
		ON CONFLICT(name) WHERE deleted_at IS NULL
		DO UPDATE SET enabled=TRUE,is_default_writing=TRUE,deleted_at=NULL`); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.NewAgentRepository(db).BootstrapStarterPack(ctx); err != nil {
		t.Fatalf("fresh-install starter bootstrap: %v", err)
	}
	for _, table := range []string{
		"post_reactions", "comment_reports", "notifications", "post_versions",
		"media_assets", "analytics_events", "ai_provider_profiles", "ai_agents",
		"ai_agent_runs", "ai_tool_calls", "ai_approvals", "ai_usage_events",
		"ai_embedding_profiles", "ai_content_index_jobs", "ai_content_chunks",
		"ai_retrieval_metrics", "ai_retrieval_eval_cases",
		"ai_skill_versions",
		"ai_workspace_bootstrap",
		"ai_workflows", "ai_workflow_versions", "ai_workflow_runs", "ai_workflow_step_runs",
		"ai_workflow_run_resources",
		"ai_workflow_events",
		"ai_connector_profiles", "ai_connector_outbox", "ai_connector_delivery_audits",
		"workflow_interaction_tasks", "workflow_run_events",
		"ai_link_health_jobs", "ai_link_health_snapshots",
		"ai_operational_suggestions",
		"ai_content_candidate_sets", "ai_content_candidates", "ai_media_candidates", "ai_feedback",
		"ai_editorial_tasks", "ai_comment_reply_drafts",
		"ai_daily_news_jobs", "ai_daily_news_runs", "ai_daily_news_sources",
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
	var providerTimeoutExtended bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname='ai_provider_timeout_check'
		AND pg_get_constraintdef(oid) LIKE '%1800%'
	)`).Scan(&providerTimeoutExtended); err != nil {
		t.Fatal(err)
	}
	if !providerTimeoutExtended {
		t.Fatal("expected ai_provider_profiles timeout to allow 1800 seconds")
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
	for _, column := range []string{"retry_of_run_id", "retry_step_id", "retry_iterations"} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema='public' AND table_name='ai_workflow_runs' AND column_name=$1
		)`, column).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("expected ai_workflow_runs.%s to exist", column)
		}
	}
	var eventTriggers bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_workflows' AND column_name='event_triggers'
	)`).Scan(&eventTriggers); err != nil {
		t.Fatal(err)
	}
	if !eventTriggers {
		t.Fatal("expected ai_workflows.event_triggers to exist")
	}
	for _, column := range []string{"attempts", "available_at", "last_error"} {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_workflow_events' AND column_name=$1
		)`, column).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("expected ai_workflow_events.%s to exist", column)
		}
	}
	var batchPrepared bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_workflow_events' AND column_name='batch_prepared'
	)`).Scan(&batchPrepared); err != nil {
		t.Fatal(err)
	}
	if !batchPrepared {
		t.Fatal("expected ai_workflow_events.batch_prepared to exist")
	}
	var systemSkills, workflows int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_skills WHERE system_key IS NOT NULL`).Scan(&systemSkills); err != nil {
		t.Fatal(err)
	}
	if systemSkills != 12 {
		t.Fatalf("expected 12 system Skills, got %d", systemSkills)
	}
	var resourceSystemSkills int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_skills WHERE system_key IN
		('media_alt_review','taxonomy_review','operations_deep_dive','mixed_content_review')`).Scan(&resourceSystemSkills); err != nil {
		t.Fatal(err)
	}
	if resourceSystemSkills != 4 {
		t.Fatalf("expected four protected resource starter Skills, got %d", resourceSystemSkills)
	}
	var dailyNewsConfigured bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
		WHERE s.system_key='daily_news' AND sv.tool_bindings ? 'rss.fetch'
	)`).Scan(&dailyNewsConfigured); err != nil {
		t.Fatal(err)
	}
	if !dailyNewsConfigured {
		t.Fatal("expected AI daily news Skill Version to pin rss.fetch configuration")
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflows WHERE template_key IN ('daily_news','weekly_operations','stale_content_refresh','low_engagement')`).Scan(&workflows); err != nil {
		t.Fatal(err)
	}
	if workflows != 4 {
		t.Fatalf("expected 4 starter Workflows, got %d", workflows)
	}
	var starterAgents int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agents WHERE deleted_at IS NULL`).Scan(&starterAgents); err != nil {
		t.Fatal(err)
	}
	if starterAgents != 12 {
		t.Fatalf("expected 12 starter Agents after Provider bootstrap, got %d", starterAgents)
	}
	var resourceWorkflows int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflows WHERE template_key IN
		('selected_pre_publish_review','selected_internal_linking','selected_distribution','selected_comment_replies',
		 'selected_media_review','selected_operations_deep_dive','selected_taxonomy_review','selected_mixed_review',
		 'selected_article_image_generation','scheduled_stale_resource_review')`).Scan(&resourceWorkflows); err != nil {
		t.Fatal(err)
	}
	if resourceWorkflows != 10 {
		t.Fatalf("expected 10 structured resource Workflows, got %d", resourceWorkflows)
	}
	var ruleWorkflows int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflows w
		JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.template_key IN ('scheduled_post_publish_review','scheduled_reported_comment_review','scheduled_missing_alt_review')
		AND w.enabled=FALSE AND v.scope_policy->>'mode'='strict'`).Scan(&ruleWorkflows); err != nil {
		t.Fatal(err)
	}
	if ruleWorkflows != 3 {
		t.Fatalf("expected 3 disabled rule-based Workflow starters, got %d", ruleWorkflows)
	}
	var partialBatchWorkflows int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflows w
		JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.template_key IN ('scheduled_post_publish_review','scheduled_reported_comment_review','scheduled_missing_alt_review')
		AND (v.steps->1->>'continue_on_error')::boolean=TRUE`).Scan(&partialBatchWorkflows); err != nil {
		t.Fatal(err)
	}
	if partialBatchWorkflows != 3 {
		t.Fatalf("expected 3 partial-failure batch Workflows, got %d", partialBatchWorkflows)
	}
	var strictVersions int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflows w
		JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.template_key LIKE 'selected_%' AND v.scope_policy->>'mode'='strict'`).Scan(&strictVersions); err != nil {
		t.Fatal(err)
	}
	if strictVersions != 8 {
		t.Fatalf("expected 8 strict selected-resource Workflow versions, got %d", strictVersions)
	}
	// Operators may enable a reviewed starter Workflow after migration. Its
	// enabled state is runtime configuration, not a schema invariant.
	var legacyWorkflowSteps bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.template_key IN ('daily_news','weekly_operations','stale_content_refresh','low_engagement')
		AND (v.steps::text LIKE '%agent_id_pointer%' OR v.steps @> '[{"type":"tool"}]'::jsonb)
	)`).Scan(&legacyWorkflowSteps); err != nil {
		t.Fatal(err)
	}
	if legacyWorkflowSteps {
		t.Fatal("starter Workflows must only use fixed Agent and generic control-flow steps")
	}
	var duplicatedAgentBehavior bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_agents'
		AND column_name IN ('system_prompt','capabilities','execution_mode','content_publish_mode','max_steps','max_input_tokens','max_output_tokens')
	)`).Scan(&duplicatedAgentBehavior); err != nil {
		t.Fatal(err)
	}
	if duplicatedAgentBehavior {
		t.Fatal("Agent behavior must be owned by Skill Versions, not ai_agents")
	}
	var unboundAgents int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agents WHERE skill_version_id IS NULL`).Scan(&unboundAgents); err != nil {
		t.Fatal(err)
	}
	if unboundAgents != 0 {
		t.Fatalf("expected every Agent to bind a Skill Version, got %d unbound", unboundAgents)
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
