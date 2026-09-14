package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestFailedApprovalRemainsActionableAndCanBeReclaimed(t *testing.T) {
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
	var agentID, runID, toolCallID, approvalID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE deleted_at IS NULL ORDER BY id LIMIT 1`).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id,trigger_type,status,input,provider,model,skill_version_id)
		VALUES($1,'manual','awaiting_approval','{}','openai','test-model',(SELECT skill_version_id FROM ai_agents WHERE id=$1)) RETURNING id`, agentID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE id=$1`, runID) }()
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,'content.create_draft','propose','{}','executed') RETURNING id`, runID).Scan(&toolCallID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,proposed_payload,status,review_note)
		VALUES($1,$2,'create_draft','post','{}','failed','previous execution failed') RETURNING id`, runID, toolCallID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}

	repo := NewApprovalRepository(db)
	items, total, err := repo.ListApprovals(ctx, string(domain.ApprovalPending), 1000, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total == 0 {
		t.Fatal("pending/actionable approval query must include failed executions")
	}
	found := false
	for _, item := range items {
		if item.ID == approvalID {
			found = item.Status == domain.ApprovalFailed
			break
		}
	}
	if !found {
		t.Fatal("failed approval was not returned as actionable work")
	}
	principalID := testsupport.Principal(t, db)
	if err := repo.ClaimApproval(ctx, approvalID, principalID, "retry"); err != nil {
		t.Fatalf("failed approval must be reclaimable: %v", err)
	}
	claimed, err := repo.GetApproval(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	if claimed.Status != domain.ApprovalApproved {
		t.Fatalf("expected reclaimed approval status approved, got %s", claimed.Status)
	}
}
