package migrations

import (
	"context"
	"testing"
)

func TestGenerationAttemptAuditUpgradePreservesUncorrelatedHistory(t *testing.T) {
	// Reuse the guarded disposable-database helper, then run the actual
	// pre-094 SQL and ledger rather than a hand-written historical schema.
	db := isolatedIdentityDB(t)
	through(t, db, "093_external_capability_gateway.sql", false)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,status,error_code)
		VALUES ('agent_candidate','media.generate_candidate',1,'test','old','failed','timeout'),
		       ('editor','editor.image',1,'test','old','succeeded','')`); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatalf("audit upgrade is not ledger-idempotent: %v", err)
	}
	var history, ledger int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_generation_audits
		WHERE model='old' AND generation_attempt IS NULL
		  AND ((source='agent_candidate' AND status='failed' AND error_code='timeout')
		    OR (source='editor' AND status='succeeded' AND error_code=''))`).Scan(&history); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_schema_migrations
		WHERE version='sql/094_generation_attempt_audit.sql'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if history != 2 || ledger != 1 {
		t.Fatalf("history was rewritten or migration was reapplied: history=%d ledger=%d", history, ledger)
	}
	// An old binary can still append evidence during an upgrade. Its absent
	// attempt must remain NULL, not default to zero or the current candidate.
	if _, err := db.ExecContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,status)
		VALUES ('agent_candidate','media.generate_candidate',1,'test','old-writer','failed')`); err != nil {
		t.Fatalf("legacy writer compatibility lost: %v", err)
	}
	var uncorrelated bool
	if err := db.QueryRowContext(ctx, `SELECT generation_attempt IS NULL FROM ai_generation_audits
		WHERE model='old-writer'`).Scan(&uncorrelated); err != nil || !uncorrelated {
		t.Fatalf("legacy writer received a fabricated identity: uncorrelated=%v err=%v", uncorrelated, err)
	}
	for _, query := range []string{
		`INSERT INTO ai_generation_audits(source,operation,status,generation_attempt)
		 VALUES ('agent_candidate','media.generate_candidate','started',0)`,
		`INSERT INTO ai_generation_audits(source,operation,status,generation_attempt)
		 VALUES ('editor','editor.image','started',1)`,
		`INSERT INTO ai_generation_audits(source,operation,status)
		 VALUES ('agent_candidate','media.generate_candidate','started')`,
	} {
		if _, err := db.ExecContext(ctx, query); err == nil {
			t.Fatal("migration accepted an invalid attempt identity or uncorrelated started row")
		}
	}
}
