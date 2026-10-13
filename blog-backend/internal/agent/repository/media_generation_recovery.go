package repository

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

var mediaRecoveryEvidenceReference = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/#-]{11,199}$`)

// ReleaseMediaGenerationAfterVerifiedReview is the ONLY supported transition
// from an uncertain, claimed generation attempt back to a human-retryable
// state. The authorizing human must have separately checked Provider and
// object-store results and acknowledged that billing may have occurred.
// These are operator attestations, not machine-proven Provider guarantees.
//
// Candidate state and an independently retained audit are committed together.
// A stale attempt, repeated decision or lost commit ACK cannot release a newer
// generation or create a second decision. No external generation is invoked.
func (r *MediaCandidateRepository) ReleaseMediaGenerationAfterVerifiedReview(ctx context.Context, value *domain.MediaGenerationRecoveryDecision) error {
	if r == nil || r.db == nil || value == nil ||
		value.CandidateID <= 0 || value.GenerationAttempt <= 0 || value.ReviewerPrincipalID <= 0 ||
		!value.VerifiedProviderOutcome || !value.VerifiedObjectStorage ||
		!value.AcknowledgedPossibleBilling ||
		!mediaRecoveryEvidenceReference.MatchString(strings.TrimSpace(value.EvidenceReference)) {
		return errors.New("invalid media generation recovery evidence")
	}
	// No Provider/object-store/network operations under the row lock.
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tx, err := r.db.BeginTx(writeCtx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// A deadline alone is NOT evidence that a worker stopped. A current
	// generating attempt must also have the explicit uncertainty marker;
	// historical failed/cancelled attempts require the same human decision
	// before becoming retryable, since their upstream outcome is unknown.
	res, err := tx.ExecContext(writeCtx, `UPDATE ai_media_candidates
		SET generation_status='cancelled', cancelled_at=NOW(),
		    error_code='manual_recovery_reviewed',
		    error_message='generation released only after independent operator review'
		WHERE id=$1 AND generation_attempt=$2 AND generation_attempt>0
		  AND (
		    (generation_status='generating' AND error_code='outcome_uncertain'
		     AND COALESCE(generation_deadline_at, generation_started_at + INTERVAL '15 minutes',
		                  created_at + INTERVAL '15 minutes') <= NOW())
		    OR generation_status IN ('failed','cancelled')
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM ai_media_generation_recovery_decisions d
		    WHERE d.candidate_id=ai_media_candidates.id
		      AND d.generation_attempt=ai_media_candidates.generation_attempt
		  )`, value.CandidateID, value.GenerationAttempt)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return sql.ErrNoRows
	}
	_, err = tx.ExecContext(writeCtx, `INSERT INTO ai_media_generation_recovery_decisions
		(candidate_id,generation_attempt,reviewed_by_principal_id,evidence_reference,
		 verified_provider_outcome,verified_object_storage,acknowledged_possible_billing)
		VALUES($1,$2,$3,$4,$5,$6,$7)`,
		value.CandidateID, value.GenerationAttempt, value.ReviewerPrincipalID,
		strings.TrimSpace(value.EvidenceReference), value.VerifiedProviderOutcome,
		value.VerifiedObjectStorage, value.AcknowledgedPossibleBilling)
	if err != nil {
		return err
	}
	// On an ambiguous COMMIT error, do not attempt a second transaction here.
	// The candidate's exact-attempt CAS and unique decision row prevent replay.
	return tx.Commit()
}
