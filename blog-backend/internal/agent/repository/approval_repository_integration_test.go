package repository

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestLegacyFailedApprovalCannotBeReplayed(t *testing.T) {
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
	items, _, err := repo.ListApprovals(ctx, string(domain.ApprovalPending), 1000, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.ID == approvalID {
			t.Fatal("legacy failed approval must not appear in actionable pending queue")
		}
	}
	principalID := testsupport.Principal(t, db)
	if err := repo.ClaimApproval(ctx, approvalID, principalID, "unsafe retry"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("legacy failed approval was replayable: %v", err)
	}
	if err := repo.RejectApproval(ctx, approvalID, principalID, "unsafe transition"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("legacy failed approval was mutable through review: %v", err)
	}
	legacy, err := repo.GetApproval(ctx, approvalID)
	if err != nil || legacy.Status != domain.ApprovalFailed {
		t.Fatalf("legacy audit status = %#v, err %v", legacy, err)
	}

	// Exercise persisted state transitions, not only the service's in-memory guard.
	if _, err := db.ExecContext(ctx, `UPDATE ai_approvals SET status='pending' WHERE id=$1`, approvalID); err != nil {
		t.Fatal(err)
	}
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalExecuted, ""); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("pending approval executed without claim: %v", err)
	}
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalFailed, "retry"); err == nil {
		t.Fatal("failed/retryable transition was accepted")
	}
	if err := repo.ClaimApproval(ctx, approvalID, principalID, "review"); err != nil {
		t.Fatal(err)
	}
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalExpired, ""); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("concurrently approved proposal was expired: %v", err)
	}
	if err := repo.ClaimApproval(ctx, approvalID, principalID, "second claimant"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("second claimant replayed effect: %v", err)
	}
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalExecuted, ""); err != nil {
		t.Fatal(err)
	}
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalExecuted, ""); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("already executed approval was completed again: %v", err)
	}
}

func TestReconcileApprovalRunPreservesClaimedExecution(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	var agentID, runID, toolID, approvalID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE deleted_at IS NULL ORDER BY id LIMIT 1`).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id,trigger_type,status,input,provider,model,skill_version_id)
		VALUES($1,'manual','awaiting_approval','{}','openai','test-model',(SELECT skill_version_id FROM ai_agents WHERE id=$1))
		RETURNING id`, agentID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = db.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE id=$1`, runID) }()
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,'content.create_draft','propose','{}','executed') RETURNING id`, runID).Scan(&toolID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,proposed_payload,status)
		VALUES($1,$2,'create_draft','post','{}','approved') RETURNING id`, runID, toolID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}
	var rejectedToolID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,'content.create_draft','propose','{}','executed') RETURNING id`, runID).Scan(&rejectedToolID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,proposed_payload,status)
		VALUES($1,$2,'create_draft','post','{}','rejected')`, runID, rejectedToolID); err != nil {
		t.Fatal(err)
	}
	repo := NewApprovalRepository(db)
	run, err := repo.ReconcileApprovalRun(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	approval, err := repo.GetApproval(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	if approval.Status != domain.ApprovalApproved || run.Status != domain.AgentRunAwaitingApproval {
		t.Fatalf("reconciliation corrupted an in-flight effect: approval=%s run=%s", approval.Status, run.Status)
	}
	// After the claimed writer exits, cancellation is safe and must not
	// erase the independently executed approval's audit record.
	if err := repo.CompleteApproval(ctx, approvalID, domain.ApprovalExecuted, ""); err != nil {
		t.Fatal(err)
	}
	run, err = repo.ReconcileApprovalRun(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	approval, err = repo.GetApproval(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != domain.AgentRunCancelled || approval.Status != domain.ApprovalExecuted {
		t.Fatalf("post-execution reconciliation = run:%s approval:%s", run.Status, approval.Status)
	}
}
