package migrations

import (
	"context"
	"testing"
)

func TestManualGenerationRecoveryUpgradeAndImmutableIdentityConstraints(t *testing.T) {
	db := isolatedIdentityDB(t)
	through(t, db, "096_generation_upstream_request_evidence.sql", false)
	ctx := context.Background()
	if err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Up(ctx, db); err != nil {
		t.Fatalf("manual recovery migration was not ledger-idempotent: %v", err)
	}
	var ledger, historic int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_schema_migrations
		WHERE version='sql/097_media_generation_reviewed_recovery.sql'`).Scan(&ledger); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_media_generation_recovery_decisions`).Scan(&historic); err != nil {
		t.Fatal(err)
	}
	if ledger != 1 || historic != 0 {
		t.Fatalf("migration forged review decisions or replayed schema: ledger=%d rows=%d", ledger, historic)
	}
	// Deliberately independent: an audit remains addressable by immutable
	// candidate/attempt numbers even when its source candidate was deleted.
	const insert = `INSERT INTO ai_media_generation_recovery_decisions
		(candidate_id,generation_attempt,reviewed_by_principal_id,evidence_reference,
		 verified_provider_outcome,verified_object_storage,acknowledged_possible_billing)
		VALUES($1,$2,$3,$4,$5,$6,$7)`
	if _, err := db.ExecContext(ctx, insert, 99999, 1, 42, "INC-20261013-0001", true, true, true); err != nil {
		t.Fatalf("valid independent reviewed decision rejected: %v", err)
	}
	for _, tc := range []struct {
		name, ref string
		candidateID int64
		attempt int
		reviewer int64
		provider, storage, billing bool
	}{
		{"duplicate", "INC-20261013-0002", 99999, 1, 42, true, true, true},
		{"missing_provider_check", "INC-20261013-0003", 99999, 2, 42, false, true, true},
		{"missing_storage_check", "INC-20261013-0004", 99999, 3, 42, true, false, true},
		{"missing_billing_ack", "INC-20261013-0005", 99999, 4, 42, true, true, false},
		{"bad_evidence", "secret?password=value", 99999, 5, 42, true, true, true},
		{"zero_attempt", "INC-20261013-0006", 99999, 0, 42, true, true, true},
		{"zero_reviewer", "INC-20261013-0007", 99999, 6, 0, true, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := db.ExecContext(ctx, insert, tc.candidateID, tc.attempt, tc.reviewer, tc.ref,
				tc.provider, tc.storage, tc.billing); err == nil {
				t.Fatal("invalid or duplicate reviewed recovery evidence was accepted")
			}
		})
	}
}
