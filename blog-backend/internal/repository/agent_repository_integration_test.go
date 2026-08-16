package repository

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestDeleteProviderRevokesCredentialAfterAgentSoftDelete(t *testing.T) {
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
	name := fmt.Sprintf("provider-revocation-%d", time.Now().UnixNano())
	profile := &domain.ProviderProfile{
		Name: name, ProviderType: domain.ProviderOpenAI, BaseURL: "https://api.example.test", Model: "test-model",
		APIKeyCiphertext: []byte("ciphertext"), APIKeyNonce: []byte("nonce"), APIKeyLast4: "1234", KeyVersion: 1,
		Enabled: true, RequestTimeoutSeconds: 60, MaxOutputTokens: 32,
	}
	repo := NewAgentRepository(db)
	if err := repo.CreateProvider(ctx, profile); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_agents WHERE provider_profile_id=$1`, profile.ID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_provider_profiles WHERE id=$1`, profile.ID)
	}()

	var skillVersionID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_skill_versions ORDER BY id LIMIT 1`).Scan(&skillVersionID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_agents
		(name, description, provider_profile_id, skill_version_id, enabled, trigger_type, timezone,
		 daily_run_limit, monthly_token_budget, deleted_at)
		VALUES ($1, '', $2, $3, false, 'manual', 'Asia/Shanghai', 1, 100, NOW())`,
		name+"-agent", profile.ID, skillVersionID); err != nil {
		t.Fatal(err)
	}
	if err := repo.DeleteProvider(ctx, profile.ID); err != nil {
		t.Fatal(err)
	}

	var ciphertext, nonce []byte
	var last4 string
	var keyVersion int
	var deleted bool
	if err := db.QueryRowContext(ctx, `SELECT api_key_ciphertext, api_key_nonce, api_key_last4, key_version, deleted_at IS NOT NULL
		FROM ai_provider_profiles WHERE id=$1`, profile.ID).Scan(&ciphertext, &nonce, &last4, &keyVersion, &deleted); err != nil {
		t.Fatal(err)
	}
	if ciphertext != nil || nonce != nil || last4 != "" || keyVersion != 0 || !deleted {
		t.Fatalf("provider deletion must revoke stored credential, ciphertext=%v nonce=%v last4=%q version=%d deleted=%v", ciphertext != nil, nonce != nil, last4, keyVersion, deleted)
	}
}

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
		(agent_id,trigger_type,status,input,provider,model)
		VALUES($1,'manual','awaiting_approval','{}','openai','test-model') RETURNING id`, agentID).Scan(&runID); err != nil {
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

	repo := NewAgentRepository(db)
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
	if err := repo.ClaimApproval(ctx, approvalID, "test-reviewer", "retry"); err != nil {
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
