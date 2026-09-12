package operations

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestApprovalEffectsPersistUnderOperationsOwnership(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	var skillVersionID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_skill_versions ORDER BY id LIMIT 1`).Scan(&skillVersionID); err != nil {
		t.Fatal(err)
	}
	var providerID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_provider_profiles(name,provider_type,base_url,model,enabled)
		VALUES($1,'openai','https://provider.example.test','test-model',TRUE) RETURNING id`, "approval-effects-provider-"+suffix).Scan(&providerID); err != nil {
		t.Fatal(err)
	}
	var agentID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agents(name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget)
		VALUES($1,'',$2,$3,FALSE,'manual','Asia/Shanghai',10,1000000) RETURNING id`, "approval-effects-agent-"+suffix, providerID, skillVersionID).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	var runID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs(agent_id,trigger_type,status,input,provider,model,skill_version_id)
		VALUES($1,'manual','awaiting_approval','{}'::jsonb,'openai','test-model',$2) RETURNING id`, agentID, skillVersionID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	var toolCallID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,'operations.test','propose','{}'::jsonb,'executed') RETURNING id`, runID).Scan(&toolCallID); err != nil {
		t.Fatal(err)
	}
	var approvalID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals(run_id,tool_call_id,action_type,target_type,proposed_payload)
		VALUES($1,$2,'create_content_candidates','post','{}'::jsonb) RETURNING id`, runID, toolCallID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}
	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
		VALUES($1,$2,'before summary','body','draft') RETURNING id`, "Approval effects "+suffix, "approval-effects-"+suffix).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	var commentID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO comments(post_id,author,author_type,content,status,is_visible)
		VALUES($1,'Fixture','anonymous','Needs reply','pending',FALSE) RETURNING id`, postID).Scan(&commentID); err != nil {
		t.Fatal(err)
	}

	svc := &Service{db: db, transactor: dbtx.NewTransactor(db, nil)}
	before, _ := json.Marshal(domain.Post{Title: "before title", Summary: "before summary"})
	targetID := postID
	approval := &domain.AgentApproval{
		ID: approvalID, RunID: runID, TargetID: &targetID, BeforeSnapshot: before,
		ProposedPayload: json.RawMessage(`{"post_id":` + fmt.Sprint(postID) + `,"field_type":"title","candidates":[{"value":"Candidate A","rationale":"a"},{"value":"Candidate B","rationale":"b"}]}`),
	}
	if err := svc.CreateContentCandidateSet(ctx, approval); err != nil {
		t.Fatal(err)
	}
	var setCount, candidateCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_content_candidate_sets WHERE source_approval_id=$1`, approvalID).Scan(&setCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_content_candidates WHERE candidate_set_id IN (SELECT id FROM ai_content_candidate_sets WHERE source_approval_id=$1)`, approvalID).Scan(&candidateCount); err != nil {
		t.Fatal(err)
	}
	if setCount != 1 || candidateCount != 2 {
		t.Fatalf("candidate persistence = sets:%d candidates:%d", setCount, candidateCount)
	}

	if err := svc.CreateEditorialTask(ctx, approvalID, "Edit "+suffix, "description", "medium"); err != nil {
		t.Fatal(err)
	}
	if err := svc.CreateReplyDraft(ctx, approvalID, commentID, "Draft reply"); err != nil {
		t.Fatal(err)
	}
	suggestion := &domain.OperationalSuggestion{SourceType: "approval_test", SourceKey: suffix, SourceRunID: &runID, Title: "Suggestion " + suffix, Description: "description", Priority: "medium", Evidence: json.RawMessage(`{"source":"test"}`)}
	if err := svc.CreateOperationalSuggestion(ctx, suggestion); err != nil {
		t.Fatal(err)
	}

	for name, query := range map[string]string{
		"editorial task": `SELECT COUNT(*) FROM ai_editorial_tasks WHERE source_approval_id=$1`,
		"reply draft":    `SELECT COUNT(*) FROM ai_comment_reply_drafts WHERE source_approval_id=$1`,
	} {
		var count int
		if err := db.QueryRowContext(ctx, query, approvalID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("%s count = %d, want 1", name, count)
		}
	}
	var suggestionCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_operational_suggestions WHERE source_run_id=$1 AND source_key=$2`, runID, suffix).Scan(&suggestionCount); err != nil {
		t.Fatal(err)
	}
	if suggestionCount != 1 {
		t.Fatalf("operational suggestion count = %d, want 1", suggestionCount)
	}
}
