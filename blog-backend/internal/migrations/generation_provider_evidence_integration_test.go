package migrations

import (
	"context"
	"strings"
	"testing"
)

func TestGenerationProviderEvidenceUpgradePreservesHistoryAndBoundsEvidence(t *testing.T) {
	db := isolatedIdentityDB(t)
	through(t, db, "094_generation_attempt_audit.sql", false)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,status,error_code)
		VALUES ('agent_candidate','media.generate_candidate',1,'test','legacy','failed','timeout')`); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatalf("evidence migration is not ledger-idempotent: %v", err)
	}
	var legacyNulls, ledger int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_generation_audits
		WHERE model='legacy' AND provider_profile_id IS NULL AND provider_vendor IS NULL
		  AND provider_config_fingerprint IS NULL AND dispatch_id IS NULL
		  AND storage_name IS NULL AND storage_url IS NULL`).Scan(&legacyNulls); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_schema_migrations
		WHERE version='sql/095_generation_provider_evidence.sql'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if legacyNulls != 1 || ledger != 1 {
		t.Fatalf("historical evidence was rewritten or migration reapplied: legacy=%d ledger=%d", legacyNulls, ledger)
	}

	for _, query := range []string{
		`INSERT INTO ai_generation_audits(source,operation,status,provider_config_fingerprint)
		  VALUES ('editor','editor.image','failed','not-a-fingerprint')`,
		`INSERT INTO ai_generation_audits(source,operation,status,dispatch_id)
		  VALUES ('editor','editor.image','failed','short')`,
		`INSERT INTO ai_generation_audits(source,operation,status,storage_name)
		  VALUES ('editor','editor.image','failed','')`,
	} {
		if _, err := db.ExecContext(ctx, query); err == nil {
			t.Fatal("migration accepted malformed bounded evidence")
		}
	}

	dispatchID := strings.Repeat("a", 32)
	fingerprint := strings.Repeat("b", 64)
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,status,provider_config_fingerprint,dispatch_id,storage_name,storage_url)
		VALUES ('editor','editor.image','failed',$1,$2,'ai-fixture.png','/media/ai-fixture.png')`,
		fingerprint, dispatchID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,status,dispatch_id) VALUES ('editor','editor.image','failed',$1)`, dispatchID); err == nil {
		t.Fatal("duplicate local dispatch evidence was accepted")
	}
}
