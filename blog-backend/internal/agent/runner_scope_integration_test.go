package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/migrations"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/tool"
)

func TestStrictWorkflowRunScope(t *testing.T) {
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

	workflowID, versionID, runID := createStrictScopeFixture(t, ctx, db)
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1`, runID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_workflow_versions WHERE id=$1`, versionID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_workflows WHERE id=$1`, workflowID)
	}()

	if _, err := db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources
		(workflow_run_id,resource_type,resource_key,source,access_level,label,snapshot)
		VALUES($1,'post','101','manual','target','Selected post','{}')`, runID); err != nil {
		t.Fatal(err)
	}

	runner := &Runner{
		repo: repository.NewAgentRepository(db),
		tools: tool.New(
			tool.Definition{Name: "content.get_post", Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{ResourceType: "post", Argument: "id"}},
			tool.Definition{Name: "content.propose_update", Risk: domain.ToolRiskPropose, Scope: &tool.ScopeRule{ResourceType: "post", Argument: "id"}},
			tool.Definition{Name: "content.create_post", Risk: domain.ToolRiskWrite},
			tool.Definition{Name: "content.search_knowledge", Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"post_id"}}},
			tool.Definition{Name: "content.search_posts", Risk: domain.ToolRiskRead, Scope: &tool.ScopeRule{Discovery: true, OutputResourceType: "post", OutputKeys: []string{"id"}}},
		),
	}
	run := &domain.AgentRun{WorkflowRunID: &runID, WorkflowVersionID: &versionID}

	if err := runner.authorizeScopedTool(ctx, run, "content.get_post", json.RawMessage(`{"id":101}`), domain.ToolRiskRead); err != nil {
		t.Fatalf("selected target read should be allowed: %v", err)
	}
	if err := runner.authorizeScopedTool(ctx, run, "content.propose_update", json.RawMessage(`{"id":101}`), domain.ToolRiskPropose); err != nil {
		t.Fatalf("selected target proposal should be allowed: %v", err)
	}
	if err := runner.authorizeScopedTool(ctx, run, "content.get_post", json.RawMessage(`{"id":202}`), domain.ToolRiskRead); !errors.Is(err, tool.ErrUnauthorized) || !strings.Contains(err.Error(), "outside this workflow run scope") {
		t.Fatalf("out-of-scope read error = %v", err)
	}

	discovery := json.RawMessage(`{"results":[{"post_id":303,"title":"Related post","status":"published"}]}`)
	if err := runner.recordDiscoveredResources(ctx, run, "content.search_knowledge", discovery); err != nil {
		t.Fatalf("record authorized discovery: %v", err)
	}
	access, exists, err := runner.repo.WorkflowResourceAccess(ctx, runID, "post", "303")
	if err != nil || !exists || access != "read" {
		t.Fatalf("discovered resource access = %q, %t, %v", access, exists, err)
	}
	if err := runner.authorizeScopedTool(ctx, run, "content.get_post", json.RawMessage(`{"id":303}`), domain.ToolRiskRead); err != nil {
		t.Fatalf("discovered resource read should be allowed: %v", err)
	}
	if err := runner.authorizeScopedTool(ctx, run, "content.propose_update", json.RawMessage(`{"id":303}`), domain.ToolRiskPropose); !errors.Is(err, tool.ErrUnauthorized) || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("discovered resource proposal error = %v", err)
	}
	if err := runner.authorizeScopedTool(ctx, run, "content.create_post", json.RawMessage(`{"title":"outside scope"}`), domain.ToolRiskWrite); !errors.Is(err, tool.ErrUnauthorized) || !strings.Contains(err.Error(), "no resource scope") {
		t.Fatalf("unscoped write error = %v", err)
	}

	filtered, err := runner.filterScopedDiscoveryResult(ctx, run, "content.search_posts", json.RawMessage(`[{"id":101},{"id":202}]`))
	if err != nil {
		t.Fatalf("filter unapproved discovery: %v", err)
	}
	if string(filtered) != `[{"id":101}]` {
		t.Fatalf("unapproved discovery output = %s", filtered)
	}
}

func createStrictScopeFixture(t *testing.T, ctx context.Context, db *sql.DB) (int64, int64, int64) {
	t.Helper()
	unique := fmt.Sprintf("scope-test-%d", time.Now().UnixNano())
	var workflowID, versionID, runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflows(name,description,template_key)
		VALUES($1,'Strict scope test',$2) RETURNING id`, unique, unique).Scan(&workflowID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
		VALUES($1,1,'{}','[]','{"mode":"strict","discovery_tools":["content.search_knowledge"]}') RETURNING id`, workflowID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,input)
		VALUES($1,$2,'{}') RETURNING id`, workflowID, versionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	return workflowID, versionID, runID
}
