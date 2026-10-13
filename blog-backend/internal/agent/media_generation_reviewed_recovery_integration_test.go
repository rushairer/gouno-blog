package agent

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

const reviewedGenerationEvidenceReference = "INC-20261013-0001"

func reviewedRecoveryDecision(candidate *domain.MediaCandidate, reviewerID int64) *domain.MediaGenerationRecoveryDecision {
	return &domain.MediaGenerationRecoveryDecision{
		CandidateID: candidate.ID, GenerationAttempt: candidate.GenerationAttempt,
		ReviewerPrincipalID: reviewerID, EvidenceReference: reviewedGenerationEvidenceReference,
		VerifiedProviderOutcome: true, VerifiedObjectStorage: true,
		AcknowledgedPossibleBilling: true,
	}
}

// This test-only helper models a completed external/provider investigation.
// It cannot be called from the product UI, bypass permissions or make network
// assertions, and must never be mistaken for an automated recovery mechanism.
func releaseGenerationAfterTestReview(t *testing.T, repo *agentrepository.MediaCandidateRepository, candidate *domain.MediaCandidate, reviewerID int64) {
	t.Helper()
	ctx := context.Background()
	if _, err := repo.RecordMediaGenerationError(ctx, candidate.ID, candidate.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, "manual investigation needed"); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(candidate, reviewerID)); err != nil {
		t.Fatal(err)
	}
}

func TestUncertainGenerationCannotBeCancelledOrReclaimedWithoutReviewedDecision(t *testing.T) {
	f, repo, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	if err := repo.CancelMediaGeneration(ctx, first.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unreviewed generating cancellation succeeded: %v", err)
	}
	if _, err := repo.RecordMediaGenerationError(ctx, first.ID, first.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, "indeterminate provider result"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimMediaGeneration(ctx, first.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("uncertain attempt was replayed: %v", err)
	}
	unconfirmed := reviewedRecoveryDecision(first, f.principal)
	unconfirmed.VerifiedObjectStorage = false
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, unconfirmed); err == nil {
		t.Fatal("recovery without independently checking object storage was accepted")
	}
	unconfirmed = reviewedRecoveryDecision(first, f.principal)
	unconfirmed.AcknowledgedPossibleBilling = false
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, unconfirmed); err == nil {
		t.Fatal("recovery without billing acknowledgement was accepted")
	}
	unconfirmed = reviewedRecoveryDecision(first, f.principal)
	unconfirmed.EvidenceReference = "too-short"
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, unconfirmed); err == nil {
		t.Fatal("recovery without a bounded incident reference was accepted")
	}
	stale := reviewedRecoveryDecision(first, f.principal)
	stale.GenerationAttempt++
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, stale); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("stale recovery attempt accepted: %v", err)
	}
	releaseGenerationAfterTestReview(t, repo, first, f.principal)
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(first, f.principal)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("review decision was replayed: %v", err)
	}

	var count, attempt int
	var actor int64
	var evidence, status string
	if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_media_generation_recovery_decisions
		WHERE candidate_id=$1 AND generation_attempt=$2`, first.ID, first.GenerationAttempt).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRowContext(ctx, `SELECT reviewed_by_principal_id,evidence_reference
		FROM ai_media_generation_recovery_decisions WHERE candidate_id=$1 AND generation_attempt=$2`,
		first.ID, first.GenerationAttempt).Scan(&actor, &evidence); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRowContext(ctx, `SELECT generation_status,generation_attempt FROM ai_media_candidates WHERE id=$1`,
		first.ID).Scan(&status, &attempt); err != nil {
		t.Fatal(err)
	}
	if count != 1 || actor != f.principal || evidence != reviewedGenerationEvidenceReference ||
		status != "ready_to_generate" || attempt != first.GenerationAttempt {
		t.Fatalf("recovery state/audit mismatch: count=%d actor=%d evidence=%q state=%s/%d",
			count, actor, evidence, status, attempt)
	}
	second, err := repo.ClaimMediaGeneration(ctx, first.ID)
	if err != nil || second.GenerationAttempt != first.GenerationAttempt+1 {
		t.Fatalf("reviewed attempt did not fence the next human-generated attempt: %#v, %v", second, err)
	}
	if err := repo.CompleteMediaGeneration(ctx, first.ID, first.GenerationAttempt, 0, true); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("stale worker finalized a newer attempt: %v", err)
	}
}

func TestConcurrentManualRecoveryReviewersCannotReleaseTwice(t *testing.T) {
	f, repo, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	if _, err := repo.RecordMediaGenerationError(ctx, first.ID, first.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, "indeterminate provider result"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(first, f.principal))
		}()
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, sql.ErrNoRows):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent recovery result: %v", err)
		}
	}
	var count int
	if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_media_generation_recovery_decisions
		WHERE candidate_id=$1 AND generation_attempt=$2`, first.ID, first.GenerationAttempt).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if success != 1 || conflicts != 1 || count != 1 {
		t.Fatalf("concurrent review was not atomic: success=%d conflicts=%d audit_rows=%d", success, conflicts, count)
	}
}

func TestHistoricalFailedAttemptRequiresReviewedRecoveryBeforeClaim(t *testing.T) {
	f, repo, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	if _, err := repo.RecordMediaGenerationError(ctx, first.ID, first.GenerationAttempt, "generation_failed", "legacy failure"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimMediaGeneration(ctx, first.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("historical failed attempt bypassed manual recovery: %v", err)
	}
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(first, f.principal)); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimMediaGeneration(ctx, first.ID); err != nil {
		t.Fatalf("reviewed legacy attempt was not claimable: %v", err)
	}
}

func TestManualRecoveryCommitAckLossDoesNotPermitDecisionReplay(t *testing.T) {
	f, repo, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	if _, err := repo.RecordMediaGenerationError(ctx, first.ID, first.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, "indeterminate provider result"); err != nil {
		t.Fatal(err)
	}
	// Inject the error at the service adapter boundary AFTER the real SQL
	// transaction has committed, mirroring a lost acknowledgement.
	lostAck := errors.New("fixture: committed before recovery ACK")
	commitThenLoseACK := func() error {
		if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(first, f.principal)); err != nil {
			return err
		}
		return lostAck
	}
	if err := commitThenLoseACK(); !errors.Is(err, lostAck) {
		t.Fatalf("commit-ACK-loss fault not exercised: %v", err)
	}
	if err := repo.ReleaseMediaGenerationAfterVerifiedReview(ctx, reviewedRecoveryDecision(first, f.principal)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("lost ACK allowed repeated recovery decision: %v", err)
	}
	var count int
	if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_media_generation_recovery_decisions WHERE candidate_id=$1`,
		first.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("committed recovery decision missing or duplicated: count=%d err=%v", count, err)
	}
}
