package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/migrations"
)

func TestScheduledResourceQueryRetryKeepsSnapshotAndScope(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	postID := insertQueryTestPost(t, ctx, db, "published")
	workflowID, versionID := createResourceQueryWorkflow(t, ctx, db, []map[string]any{
		{"id": "select_posts", "type": "resource_query", "resource_type": "post", "filter": map[string]any{"status": "published", "updated_before_days": 180}, "max_items": 20},
		{"id": "result", "type": "output", "output_pointer": "/steps/select_posts"},
	})
	t.Cleanup(func() {
		cleanupResourceQueryFixture(t, ctx, db, workflowID, versionID, postID)
	})

	service := &Service{db: db, catalog: NewResourceCatalog(db)}
	run, err := service.queue(ctx, workflowID, false, json.RawMessage(`{}`), nil, true, true)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.execute(ctx, run.ID); err != nil {
		t.Fatal(err)
	}
	var lastCount int
	if err := db.QueryRowContext(ctx, `SELECT resource_query_last_count FROM ai_workflows WHERE id=$1`, workflowID).Scan(&lastCount); err != nil {
		t.Fatal(err)
	}
	if lastCount != 1 {
		t.Fatalf("last resource query count = %d, want 1", lastCount)
	}
	before := workflowQuerySnapshot(t, ctx, db, run.ID)
	resources, err := service.ListResources(ctx, run.ID)
	if err != nil || len(resources) != 1 || resources[0].Source != "query" || resources[0].AccessLevel != "target" || resources[0].ResourceKey != fmt.Sprint(postID) {
		t.Fatalf("initial query resources = %#v, %v", resources, err)
	}

	if _, err := db.ExecContext(ctx, `UPDATE posts SET status='draft' WHERE id=$1`, postID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='failed',finished_at=NOW() WHERE id=$1`, run.ID); err != nil {
		t.Fatal(err)
	}
	retry, err := service.queue(ctx, workflowID, false, json.RawMessage(`{}`), nil, true, true)
	if err != nil {
		t.Fatal(err)
	}
	if retry.ID != run.ID || retry.Status != "queued" {
		t.Fatalf("retry run = %#v", retry)
	}
	resources, err = service.ListResources(ctx, run.ID)
	if err != nil || len(resources) != 1 || resources[0].Source != "query" || resources[0].ResourceKey != fmt.Sprint(postID) {
		t.Fatalf("retry must retain query scope = %#v, %v", resources, err)
	}
	if err := service.execute(ctx, run.ID); err != nil {
		t.Fatal(err)
	}
	if after := workflowQuerySnapshot(t, ctx, db, run.ID); after != before {
		t.Fatalf("replayed query snapshot changed:\nbefore=%s\nafter=%s", before, after)
	}
}

func TestResourceQueryEmptyPolicyCanFailWithoutAgentRun(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := createResourceQueryWorkflow(t, ctx, db, []map[string]any{
		{"id": "select_posts", "type": "resource_query", "resource_type": "post", "filter": map[string]any{"tag": "__resource_query_no_match__"}, "max_items": 20},
	})
	t.Cleanup(func() { cleanupResourceQueryFixture(t, ctx, db, workflowID, versionID, 0) })
	if _, err := db.ExecContext(ctx, `UPDATE ai_workflows SET resource_query_empty_policy='fail' WHERE id=$1`, workflowID); err != nil {
		t.Fatal(err)
	}
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input) VALUES($1,$2,'{}') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: db, catalog: NewResourceCatalog(db)}
	service.Execute(ctx, runID)
	var status, message string
	if err := db.QueryRowContext(ctx, `SELECT status,error_message FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status, &message); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || !strings.Contains(message, "no matching resources") {
		t.Fatalf("empty failure policy = status %q message %q", status, message)
	}
}

func TestSavePersistsResourceQueryPreview(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	service := &Service{db: db, catalog: NewResourceCatalog(db)}
	value := &domain.Workflow{
		Name:        fmt.Sprintf("resource-query-preview-%d", time.Now().UnixNano()),
		Description: "Resource query preview integration test",
		InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false}`),
		Steps: []domain.WorkflowStep{
			{ID: "select_posts", Type: "resource_query", ResourceType: "post", Filter: json.RawMessage(`{"tag":"__resource_query_no_match__"}`), MaxItems: 20},
			{ID: "result", Type: "output", OutputPointer: "/steps/select_posts"},
		},
		ScopePolicy:              domain.WorkflowScopePolicy{Mode: "strict"},
		ResourceQueryEmptyPolicy: "succeed",
	}
	if err := service.Save(ctx, value); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupResourceQueryFixture(t, ctx, db, value.ID, value.VersionID, 0) })
	var rawPreview []byte
	if err := db.QueryRowContext(ctx, `SELECT resource_query_preview FROM ai_workflows WHERE id=$1`, value.ID).Scan(&rawPreview); err != nil {
		t.Fatal(err)
	}
	var preview []map[string]any
	if err := json.Unmarshal(rawPreview, &preview); err != nil {
		t.Fatal(err)
	}
	if len(preview) != 1 || preview[0]["step_id"] != "select_posts" || preview[0]["estimated_count"] != float64(0) {
		t.Fatalf("saved resource query preview = %#v", preview)
	}
}

func TestRuleBasedResourceFilters(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	unique := fmt.Sprintf("rule-filter-%d", time.Now().UnixNano())
	var postID, missingAltID, describedID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,tags,status,published_at,updated_at)
		VALUES('Recent rule filter',$1,'summary','content',ARRAY[$2],'published',NOW(),NOW()) RETURNING id`, unique, unique).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO media_assets(filename,storage_name,url,content_type,size_bytes,alt_text)
		VALUES($1,$2,$3,'image/png',10,'') RETURNING id`, unique+"-missing.png", unique+"-missing", "/media/"+unique+"-missing.png").Scan(&missingAltID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO media_assets(filename,storage_name,url,content_type,size_bytes,alt_text)
		VALUES($1,$2,$3,'image/png',10,'described') RETURNING id`, unique+"-described.png", unique+"-described", "/media/"+unique+"-described.png").Scan(&describedID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.ExecContext(ctx, `DELETE FROM media_assets WHERE id IN ($1,$2)`, missingAltID, describedID); err != nil {
			t.Errorf("delete rule filter media: %v", err)
		}
		if _, err := db.ExecContext(ctx, `DELETE FROM posts WHERE id=$1`, postID); err != nil {
			t.Errorf("delete rule filter post: %v", err)
		}
	})
	catalog := NewResourceCatalog(db)
	posts, total, err := catalog.List(ctx, "post", domain.ResourceQuery{Page: 1, PageSize: 20, Filters: map[string]string{"tag": unique, "published_within_days": "2"}})
	if err != nil || total != 1 || len(posts) != 1 || posts[0].Key != fmt.Sprint(postID) {
		t.Fatalf("recent post filter = %#v total %d err %v", posts, total, err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE posts SET published_at=NOW()-INTERVAL '10 days' WHERE id=$1`, postID); err != nil {
		t.Fatal(err)
	}
	posts, total, err = catalog.List(ctx, "post", domain.ResourceQuery{Page: 1, PageSize: 20, Filters: map[string]string{"tag": unique, "published_within_days": "2"}})
	if err != nil || total != 0 || len(posts) != 0 {
		t.Fatalf("old post filter = %#v total %d err %v", posts, total, err)
	}
	media, total, err := catalog.List(ctx, "media_asset", domain.ResourceQuery{Query: unique, Page: 1, PageSize: 20, Filters: map[string]string{"missing_alt": "true"}})
	if err != nil || total != 1 || len(media) != 1 || media[0].Key != fmt.Sprint(missingAltID) {
		t.Fatalf("missing Alt filter = %#v total %d err %v", media, total, err)
	}
}

func TestForEachCanAggregatePartialFailures(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := createResourceQueryWorkflow(t, ctx, db, []map[string]any{
		{"id": "batch", "type": "for_each", "collection_pointer": "/input/items", "max_items": 3, "continue_on_error": true, "steps": []map[string]any{{"id": "value", "type": "output", "output_pointer": "/item/value"}}},
		{"id": "result", "type": "output", "output_pointer": "/steps/batch"},
	})
	t.Cleanup(func() { cleanupResourceQueryFixture(t, ctx, db, workflowID, versionID, 0) })
	service := &Service{db: db}
	var runID int64
	input := `{"items":[{"value":"first"},{"missing":true},{"value":"third"}]}`
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input) VALUES($1,$2,$3) RETURNING id`, workflowID, versionID, input).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if err := service.execute(ctx, runID); err != nil {
		t.Fatal(err)
	}
	var status string
	var rawOutput []byte
	if err := db.QueryRowContext(ctx, `SELECT status,output FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status, &rawOutput); err != nil {
		t.Fatal(err)
	}
	var output map[string]any
	if err := json.Unmarshal(rawOutput, &output); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || output["status"] != "partial_failure" || output["succeeded"] != float64(2) || output["failed"] != float64(1) {
		t.Fatalf("partial batch = status %q output %#v", status, output)
	}
	var failedSteps int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_step_runs WHERE workflow_run_id=$1 AND step_id='value' AND status='failed'`, runID).Scan(&failedSteps); err != nil {
		t.Fatal(err)
	}
	if failedSteps != 1 {
		t.Fatalf("failed child step count = %d", failedSteps)
	}

	var failedRunID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input) VALUES($1,$2,'{"items":[{"missing":true}]}') RETURNING id`, workflowID, versionID).Scan(&failedRunID); err != nil {
		t.Fatal(err)
	}
	service.Execute(ctx, failedRunID)
	var failedStatus string
	if err := db.QueryRowContext(ctx, `SELECT status FROM ai_workflow_runs WHERE id=$1`, failedRunID).Scan(&failedStatus); err != nil {
		t.Fatal(err)
	}
	if failedStatus != "failed" {
		t.Fatalf("all-failed batch status = %q", failedStatus)
	}
}

func TestRetryFailedForEachIterationUsesOriginalInput(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := createResourceQueryWorkflow(t, ctx, db, []map[string]any{
		{"id": "batch", "type": "for_each", "collection_pointer": "/input/items", "max_items": 3, "continue_on_error": true,
			"steps": []map[string]any{{"id": "value", "type": "output", "output_pointer": "/item/value"}}},
	})
	t.Cleanup(func() { cleanupResourceQueryFixture(t, ctx, db, workflowID, versionID, 0) })
	service := &Service{db: db}
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input) VALUES($1,$2,'{"items":[{"value":"ok"},{"missing":true}]}') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if err := service.execute(ctx, runID); err != nil {
		t.Fatal(err)
	}
	retry, err := service.RetryFailed(ctx, runID, "value", []int{1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if retry.Status != "queued" || retry.RetryOfRunID == nil || *retry.RetryOfRunID != runID || retry.RetryStepID == nil || *retry.RetryStepID != "batch" {
		t.Fatalf("retry metadata = %#v", retry)
	}
	if err := service.execute(ctx, retry.ID); err == nil {
		t.Fatal("expected selected failed iteration to fail again")
	}
	var iterationZero, iterationOne int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FILTER (WHERE iteration=0), COUNT(*) FILTER (WHERE iteration=1) FROM ai_workflow_step_runs WHERE workflow_run_id=$1 AND step_id='value'`, retry.ID).Scan(&iterationZero, &iterationOne); err != nil {
		t.Fatal(err)
	}
	if iterationZero != 0 || iterationOne != 1 {
		t.Fatalf("retry iterations = zero:%d one:%d", iterationZero, iterationOne)
	}
}

func TestEmptyResourceQueryDoesNotCreateAgentRun(t *testing.T) {
	db := openWorkflowIntegrationDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	workflowID, versionID := createResourceQueryWorkflow(t, ctx, db, []map[string]any{
		{"id": "select_posts", "type": "resource_query", "resource_type": "post", "filter": map[string]any{"status": "published", "updated_before_days": 3650}, "max_items": 20},
		{"id": "agent", "type": "model", "agent_id": 999999},
	})
	t.Cleanup(func() {
		cleanupResourceQueryFixture(t, ctx, db, workflowID, versionID, 0)
	})
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input)
		VALUES($1,$2,'{}') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: db, catalog: NewResourceCatalog(db)}
	if err := service.execute(ctx, runID); err != nil {
		t.Fatal(err)
	}
	var status string
	var output json.RawMessage
	if err := db.QueryRowContext(ctx, `SELECT status,output FROM ai_workflow_runs WHERE id=$1`, runID).Scan(&status, &output); err != nil {
		t.Fatal(err)
	}
	var result map[string]string
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || result["status"] != "no_matching_resources" || result["resource_type"] != "post" {
		t.Fatalf("empty query run = status %q output %s", status, output)
	}
	var agentRuns int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agent_runs WHERE workflow_run_id=$1`, runID).Scan(&agentRuns); err != nil {
		t.Fatal(err)
	}
	if agentRuns != 0 {
		t.Fatalf("empty query created %d Agent Runs", agentRuns)
	}
}

func openWorkflowIntegrationDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Up(context.Background(), db); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	return db
}

func insertQueryTestPost(t *testing.T, ctx context.Context, db *sql.DB, status string) int64 {
	t.Helper()
	slug := fmt.Sprintf("resource-query-%d", time.Now().UnixNano())
	var id int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status,published_at,updated_at)
		VALUES('Resource query test',$1,'summary','content',$2,NOW()-INTERVAL '200 days',NOW()-INTERVAL '200 days') RETURNING id`, slug, status).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func createResourceQueryWorkflow(t *testing.T, ctx context.Context, db *sql.DB, steps []map[string]any) (int64, int64) {
	t.Helper()
	unique := fmt.Sprintf("resource-query-workflow-%d", time.Now().UnixNano())
	var workflowID, versionID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflows(name,description,enabled,cron_expression,timezone,template_key)
		VALUES($1,'Resource query integration test',TRUE,'0 9 * * *','Asia/Shanghai',$2) RETURNING id`, unique, unique).Scan(&workflowID); err != nil {
		t.Fatal(err)
	}
	rawSteps, err := json.Marshal(steps)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
		VALUES($1,1,'{}',$2,'{"mode":"strict","discovery_tools":[]}') RETURNING id`, workflowID, rawSteps).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	return workflowID, versionID
}

func cleanupResourceQueryFixture(t *testing.T, ctx context.Context, db *sql.DB, workflowID, versionID, postID int64) {
	t.Helper()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Errorf("begin resource query fixture cleanup: %v", err)
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE workflow_id=$1`, workflowID); err != nil {
		t.Errorf("delete resource query workflow runs: %v", err)
		return
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ai_workflow_versions WHERE id=$1 AND workflow_id=$2`, versionID, workflowID); err != nil {
		t.Errorf("delete resource query workflow version: %v", err)
		return
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ai_workflows WHERE id=$1 AND description IN ('Resource query integration test','Resource query preview integration test')`, workflowID); err != nil {
		t.Errorf("delete resource query workflow: %v", err)
		return
	}
	if postID != 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM posts WHERE id=$1`, postID); err != nil {
			t.Errorf("delete resource query post: %v", err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		t.Errorf("commit resource query fixture cleanup: %v", err)
	}
}

func workflowQuerySnapshot(t *testing.T, ctx context.Context, db *sql.DB, runID int64) string {
	t.Helper()
	var output json.RawMessage
	if err := db.QueryRowContext(ctx, `SELECT output FROM ai_workflow_step_runs
		WHERE workflow_run_id=$1 AND step_id='select_posts' AND iteration=-1 AND status='succeeded'
		ORDER BY id DESC LIMIT 1`, runID).Scan(&output); err != nil {
		t.Fatal(err)
	}
	return string(output)
}
