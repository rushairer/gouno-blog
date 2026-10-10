package agent

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

// An expired deadline is a READ-ONLY investigation hint, not a lease.
// Listing it may not change status, mark failure or make the job claimable.
func TestExpiredMediaGenerationIsReportableWithoutMutation(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_media_candidate")
	ctx := context.Background()
	if err := f.service(f.repo, f.transactor).Approve(ctx, f.approvalID, f.principal, "approved"); err != nil {
		t.Fatal(err)
	}
	repo := agentrepository.NewMediaCandidateRepository(f.db)
	items, err := repo.ListMediaCandidates(ctx)
	if err != nil { t.Fatal(err) }
	var candidate *domain.MediaCandidate
	for _, item := range items {
		if item.SourceApprovalID != nil && *item.SourceApprovalID == f.approvalID {
			candidate = item
			break
		}
	}
	if candidate == nil { t.Fatal("approved media candidate not found") }
	claimed, err := repo.ClaimMediaGeneration(ctx, candidate.ID)
	if err != nil { t.Fatal(err) }
	if _, err := repo.ListMediaGenerationReconciliation(ctx, 0); err == nil {
		t.Fatal("unbounded reconciliation limit allowed")
	}
	if _, err := repo.ListMediaGenerationReconciliation(ctx, 101); err == nil {
		t.Fatal("reconciliation limit over 100 allowed")
	}
	list, err := repo.ListMediaGenerationReconciliation(ctx, 50)
	if err != nil { t.Fatal(err) }
	for _, item := range list {
		if item.CandidateID == candidate.ID {
			t.Fatal("active generation flagged as overdue before deadline")
		}
	}
	if _, err := f.db.ExecContext(ctx, `UPDATE ai_media_candidates
		SET generation_deadline_at = NOW() - INTERVAL '5 minutes' WHERE id=$1`, candidate.ID); err != nil {
		t.Fatal(err)
	}
	var auditID int64
	if err := f.db.QueryRowContext(ctx, `INSERT INTO ai_generation_audits
		(source,operation,template_version,provider,model,input_tokens,output_tokens,
		 status,error_code,media_candidate_id)
		VALUES('agent_candidate','media.generate_candidate',1,'test','test',0,0,'failed','provider_timeout',$1)
		RETURNING id`, candidate.ID).Scan(&auditID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = f.db.ExecContext(context.Background(), `DELETE FROM ai_generation_audits WHERE id=$1`, auditID)
	})
	list, err = repo.ListMediaGenerationReconciliation(ctx, 50)
	if err != nil { t.Fatal(err) }
	var report *domain.MediaGenerationReconciliation
	for _, item := range list {
		if item.CandidateID == candidate.ID {
			report = item
			break
		}
	}
	if report == nil { t.Fatal("overdue generating candidate absent from reconciliation report") }
	if report.GenerationAttempt != claimed.GenerationAttempt || report.LatestAuditID == nil ||
		*report.LatestAuditID != auditID || report.LatestAuditStatus != "failed" ||
		report.LatestAuditErrorCode != "provider_timeout" {
		t.Fatalf("missing audit or attempt evidence: %#v", report)
	}
	if report.GenerationDeadlineAt == nil || !report.GenerationDeadlineAt.Before(time.Now()) {
		t.Fatalf("report did not preserve overdue deadline: %#v", report)
	}
	var status string
	var attempt int
	if err := f.db.QueryRowContext(ctx, `SELECT generation_status,generation_attempt
		FROM ai_media_candidates WHERE id=$1`, candidate.ID).Scan(&status, &attempt); err != nil {
		t.Fatal(err)
	}
	if status != "generating" || attempt != claimed.GenerationAttempt {
		t.Fatalf("read-only reconciliation mutated state: status=%q attempt=%d", status, attempt)
	}
	if _, err := repo.ClaimMediaGeneration(ctx, candidate.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expired claim automatically became retryable: %v", err)
	}
}

// When the provider returns an ambiguous timeout/connection error, keep the
// current attempt fenced and surface it immediately for human review.
func TestUncertainMediaGenerationRemainsUnclaimableAndFenced(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_media_candidate")
	ctx := context.Background()
	if err := f.service(f.repo, f.transactor).Approve(ctx, f.approvalID, f.principal, "approved"); err != nil {
		t.Fatal(err)
	}
	repo := agentrepository.NewMediaCandidateRepository(f.db)
	all, err := repo.ListMediaCandidates(ctx)
	if err != nil { t.Fatal(err) }
	var id int64
	for _, candidate := range all {
		if candidate.SourceApprovalID != nil && *candidate.SourceApprovalID == f.approvalID {
			id = candidate.ID
			break
		}
	}
	if id == 0 { t.Fatal("missing approved media candidate") }
	claim, err := repo.ClaimMediaGeneration(ctx, id)
	if err != nil { t.Fatal(err) }
	const safeDiagnostic = "provider outcome unconfirmed; manual reconciliation required"
	if _, err := repo.RecordMediaGenerationError(ctx, id, claim.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, safeDiagnostic); err != nil { t.Fatal(err) }
	var status, code, msg string
	var deadline time.Time
	if err := f.db.QueryRowContext(ctx, `SELECT generation_status,error_code,error_message,generation_deadline_at
		FROM ai_media_candidates WHERE id=$1`, id).Scan(&status, &code, &msg, &deadline); err != nil { t.Fatal(err) }
	if status != "generating" || code != domain.MediaGenerationOutcomeUncertainCode ||
		msg != safeDiagnostic || deadline.After(time.Now()) {
		t.Fatalf("ambiguous provider result enabled retry or lost diagnosis: status=%q code=%q msg=%q deadline=%v",
			status, code, msg, deadline)
	}
	if _, err := repo.ClaimMediaGeneration(ctx, id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("ambiguous provider request was re-claimed: %v", err)
	}
	report, err := repo.ListMediaGenerationReconciliation(ctx, 50)
	if err != nil { t.Fatal(err) }
	found := false
	for _, item := range report {
		if item.CandidateID == id {
			found = true
			if item.GenerationAttempt != claim.GenerationAttempt ||
				item.ErrorCode != domain.MediaGenerationOutcomeUncertainCode {
				t.Fatalf("incomplete uncertain result evidence: %#v", item)
			}
		}
	}
	if !found { t.Fatal("uncertain attempt missing from operator report") }
	// An explicit admin cancellation can fence off the old attempt; automatic
	// reclamation is still forbidden. A new claim is a separate human action.
	if err := repo.CancelMediaGeneration(ctx, id); err != nil { t.Fatal(err) }
	second, err := repo.ClaimMediaGeneration(ctx, id)
	if err != nil { t.Fatal(err) }
	if second.GenerationAttempt != claim.GenerationAttempt+1 { t.Fatal("attempt did not advance") }
	if _, err := repo.RecordMediaGenerationError(ctx, id, claim.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, safeDiagnostic); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("late uncertain old attempt affected new attempt: %v", err)
	}
	var nextStatus string
	var nextCode sql.NullString
	if err := f.db.QueryRowContext(ctx, `SELECT generation_status,error_code
		FROM ai_media_candidates WHERE id=$1`, id).Scan(&nextStatus, &nextCode); err != nil { t.Fatal(err) }
	if nextStatus != "generating" || nextCode.Valid {
		t.Fatalf("stale attempt poisoned new generation: status=%q code=%v", nextStatus, nextCode)
	}
}
