package migrations

import (
	"context"
	"strings"
	"testing"
)

func TestGenerationUpstreamRequestEvidenceUpgradePreservesHistoryAndConstraints(t *testing.T) {
	db := isolatedIdentityDB(t)
	through(t, db, "095_generation_provider_evidence.sql", false)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,status,error_code)
		VALUES ('agent_candidate','media.generate_candidate',1,'openai','legacy-upstream','failed','timeout')`); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatalf("upstream evidence migration is not ledger-idempotent: %v", err)
	}
	var legacyNulls, forwarded, ledger int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*),COUNT(*) FILTER (WHERE client_request_id_sent)
		FROM ai_generation_audits
		WHERE model='legacy-upstream' AND upstream_request_id IS NULL
		  AND upstream_account_id IS NULL AND upstream_workspace_id IS NULL`).Scan(&legacyNulls, &forwarded); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_schema_migrations
		WHERE version='sql/096_generation_upstream_request_evidence.sql'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if legacyNulls != 1 || forwarded != 0 || ledger != 1 {
		t.Fatalf("historical upstream evidence was fabricated: legacy=%d forwarded=%d ledger=%d", legacyNulls, forwarded, ledger)
	}

	tooLong := strings.Repeat("r", 513)
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,status,upstream_request_id) VALUES ('editor','editor.image','failed',$1)`, tooLong); err == nil {
		t.Fatal("oversized upstream request ID accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,status,client_request_id_sent) VALUES ('editor','editor.image','failed',TRUE)`); err == nil {
		t.Fatal("forwarded client request ID accepted without governed dispatch identity")
	}

	dispatchID := strings.Repeat("a", 32)
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,status,generation_attempt,provider_vendor,dispatch_id,upstream_request_id,upstream_account_id,
		 upstream_workspace_id,client_request_id_sent)
		VALUES ('agent_candidate','media.generate_candidate','outcome_uncertain',1,'openai',$1,
		        'req_fixture','org_fixture','ws_fixture',TRUE)`, dispatchID); err != nil {
		t.Fatal(err)
	}
}
