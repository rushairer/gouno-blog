package agent

import (
	"context"
	"database/sql"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/provider"
)

func newGenerationAuditFixture(t *testing.T) (*atomicApprovalFixture, *agentrepository.MediaCandidateRepository, *domain.MediaCandidate) {
	t.Helper()
	f := newAtomicApprovalFixture(t, "create_media_candidate")
	ctx := context.Background()
	if err := f.service(f.repo, f.transactor).Approve(ctx, f.approvalID, f.principal, "approved"); err != nil {
		t.Fatal(err)
	}
	repo := agentrepository.NewMediaCandidateRepository(f.db)
	items, err := repo.ListMediaCandidates(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range items {
		if candidate.SourceApprovalID != nil && *candidate.SourceApprovalID == f.approvalID {
			t.Cleanup(func() {
				_, _ = f.db.ExecContext(context.Background(), `DELETE FROM ai_generation_audits
					WHERE media_candidate_id=$1 OR agent_run_id=$2`, candidate.ID, candidate.SourceRunID)
			})
			claimed, claimErr := repo.ClaimMediaGeneration(ctx, candidate.ID)
			if claimErr != nil {
				t.Fatal(claimErr)
			}
			return f, repo, claimed
		}
	}
	t.Fatal("approved candidate not found")
	return nil, nil, nil
}

func newStartedAttemptAudit(candidate *domain.MediaCandidate) *domain.GenerationAudit {
	return &domain.GenerationAudit{
		Source: "agent_candidate", Operation: "media.generate_candidate", TemplateVersion: 1,
		Provider: "test", Model: "test", Status: "started",
		MediaCandidateID: &candidate.ID, GenerationAttempt: &candidate.GenerationAttempt,
		AgentRunID: &candidate.SourceRunID, WorkflowRunID: candidate.WorkflowRunID,
	}
}

func attemptReconciliationReport(t *testing.T, f *atomicApprovalFixture, repo *agentrepository.MediaCandidateRepository, id int64) *domain.MediaGenerationReconciliation {
	t.Helper()
	if _, err := f.db.ExecContext(context.Background(), `UPDATE ai_media_candidates
		SET generation_deadline_at=NOW()-INTERVAL '1 minute' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	items, err := repo.ListMediaGenerationReconciliation(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.CandidateID == id {
			return item
		}
	}
	t.Fatal("candidate missing from reconciliation report")
	return nil
}

func TestAttemptAuditReconciliationDoesNotInferLegacyOrLateWorkerIdentity(t *testing.T) {
	f, candidates, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	audits := agentrepository.NewGenerationAuditRepository(f.db)
	legacy := newStartedAttemptAudit(first)
	legacy.GenerationAttempt, legacy.Status, legacy.ErrorCode = nil, "failed", "timeout"
	if err := audits.RecordGenerationAudit(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	report := attemptReconciliationReport(t, f, candidates, first.ID)
	if report.LatestAuditID == nil || *report.LatestAuditID != legacy.ID ||
		report.LatestAuditGenerationAttempt != nil || report.LatestAuditMatchesCurrentAttempt || report.CurrentAttemptAudit != nil {
		t.Fatalf("legacy evidence was assigned to a current attempt: %#v", report)
	}
	firstAudit := newStartedAttemptAudit(first)
	if err := audits.RecordGenerationAudit(ctx, firstAudit); err != nil {
		t.Fatal(err)
	}
	if err := candidates.CancelMediaGeneration(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	second, err := candidates.ClaimMediaGeneration(ctx, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	secondAudit := newStartedAttemptAudit(second)
	if err := audits.RecordGenerationAudit(ctx, secondAudit); err != nil {
		t.Fatal(err)
	}
	report = attemptReconciliationReport(t, f, candidates, first.ID)
	if !report.LatestAuditMatchesCurrentAttempt || report.CurrentAttemptAudit == nil ||
		report.CurrentAttemptAudit.ID != secondAudit.ID || report.CurrentAttemptAudit.GenerationAttempt != second.GenerationAttempt {
		t.Fatalf("current audit not exactly matched: %#v", report)
	}
	wrongIdentity := *firstAudit
	wrongIdentity.GenerationAttempt, wrongIdentity.Status = &second.GenerationAttempt, "succeeded"
	if err := audits.RecordGenerationAudit(ctx, &wrongIdentity); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("audit ID was reassigned to another attempt: %v", err)
	}
	firstAudit.Status = "succeeded"
	if err := audits.RecordGenerationAudit(ctx, firstAudit); err != nil {
		t.Fatalf("late old worker could not finish its own audit: %v", err)
	}
	firstAudit.Status = domain.MediaGenerationOutcomeUncertainCode
	if err := audits.RecordGenerationAudit(ctx, firstAudit); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("terminal observation was overwritten: %v", err)
	}
	// A late legacy worker can append a newer timestamp without knowing any
	// attempt. Keep that observation visible but separate from current evidence.
	lateLegacy := newStartedAttemptAudit(first)
	lateLegacy.GenerationAttempt, lateLegacy.Status = nil, "failed"
	if err := audits.RecordGenerationAudit(ctx, lateLegacy); err != nil {
		t.Fatal(err)
	}
	report = attemptReconciliationReport(t, f, candidates, first.ID)
	if report.LatestAuditID == nil || *report.LatestAuditID != lateLegacy.ID ||
		report.LatestAuditMatchesCurrentAttempt || report.CurrentAttemptAudit == nil ||
		report.CurrentAttemptAudit.ID != secondAudit.ID || report.CurrentAttemptAudit.Status != "started" {
		t.Fatalf("latest legacy or old-worker audit shadowed the current attempt: %#v", report)
	}
	var status string
	var attempt int
	if err := f.db.QueryRowContext(ctx, `SELECT generation_status,generation_attempt FROM ai_media_candidates WHERE id=$1`, first.ID).Scan(&status, &attempt); err != nil {
		t.Fatal(err)
	}
	if status != "generating" || attempt != second.GenerationAttempt {
		t.Fatalf("audit or reporting mutated candidate state: %s/%d", status, attempt)
	}
	if _, err := candidates.ClaimMediaGeneration(ctx, first.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("audit evidence or deadline permitted automatic retry: %v", err)
	}
}

func TestLatePreflightAuditDoesNotBecomeCurrentAttemptEvidence(t *testing.T) {
	f, candidates, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	audits := agentrepository.NewGenerationAuditRepository(f.db)
	if err := candidates.CancelMediaGeneration(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	second, err := candidates.ClaimMediaGeneration(ctx, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	current := newStartedAttemptAudit(second)
	if err := audits.RecordGenerationAudit(ctx, current); err != nil {
		t.Fatal(err)
	}
	late := newStartedAttemptAudit(first)
	late.Status, late.ErrorCode = domain.MediaGenerationOutcomeUncertainCode, domain.MediaGenerationOutcomeUncertainCode
	if err := audits.RecordGenerationAudit(ctx, late); err != nil {
		t.Fatal(err)
	}
	report := attemptReconciliationReport(t, f, candidates, first.ID)
	if report.LatestAuditID == nil || *report.LatestAuditID != late.ID ||
		report.LatestAuditGenerationAttempt == nil || *report.LatestAuditGenerationAttempt != first.GenerationAttempt ||
		report.LatestAuditMatchesCurrentAttempt || report.CurrentAttemptAudit == nil || report.CurrentAttemptAudit.ID != current.ID {
		t.Fatalf("late previous-attempt evidence was mistaken for the current attempt: %#v", report)
	}
}

func TestConcurrentAttemptAuditStartsDispatchOnlyOneProviderRequest(t *testing.T) {
	f, _, candidate := newGenerationAuditFixture(t)
	audits := agentrepository.NewGenerationAuditRepository(f.db)
	s := &GenerationService{repo: audits}
	var calls atomic.Int64
	generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
		calls.Add(1)
		return provider.ImageResult{Data: []byte("test"), MIMEType: "image/png"}, nil
	})
	start := make(chan struct{})
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			req := testImageAttemptRequest()
			req.MediaCandidateID, req.GenerationAttempt = &candidate.ID, &candidate.GenerationAttempt
			<-start
			_, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator)
			if err == nil {
				s.recordImageAudit(req, "test", "test", 0, 0, nil, nil)
			}
			results <- err
		}()
	}
	close(start)
	succeeded, blocked := 0, 0
	for i := 0; i < 2; i++ {
		err := <-results
		if err == nil {
			succeeded++
		} else if errors.Is(err, errImageAuditUnconfirmed) {
			blocked++
		} else {
			t.Errorf("unexpected dispatch result: %v", err)
		}
	}
	var rows int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM ai_generation_audits WHERE media_candidate_id=$1 AND generation_attempt=$2`, candidate.ID, candidate.GenerationAttempt).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 || succeeded != 1 || blocked != 1 || rows != 1 {
		t.Fatalf("duplicate attempt dispatched: calls=%d successes=%d blocked=%d rows=%d", calls.Load(), succeeded, blocked, rows)
	}
}

func TestPersistedStartWithLostAcknowledgementRemainsEvidenceWithoutDispatch(t *testing.T) {
	f, candidates, candidate := newGenerationAuditFixture(t)
	audits := agentrepository.NewGenerationAuditRepository(f.db)
	s := &GenerationService{repo: attemptAuditRecorderFunc(func(ctx context.Context, audit *domain.GenerationAudit) error {
		if err := audits.RecordGenerationAudit(ctx, audit); err != nil {
			return err
		}
		return errors.New("commit acknowledgement lost after durable INSERT")
	})}
	req := testImageAttemptRequest()
	req.MediaCandidateID, req.GenerationAttempt = &candidate.ID, &candidate.GenerationAttempt
	calls := 0
	generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
		calls++
		return provider.ImageResult{}, nil
	})
	if _, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator); !errors.Is(err, errImageAuditUnconfirmed) {
		t.Fatalf("lost audit acknowledgement did not block dispatch: %v", err)
	}
	// Even a fresh caller with working DB transport cannot reinterpret the
	// already-persisted row as permission to issue this same attempt again.
	s.repo = audits
	if _, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator); !errors.Is(err, errImageAuditUnconfirmed) {
		t.Fatalf("existing started audit allowed redispatch: %v", err)
	}
	report := attemptReconciliationReport(t, f, candidates, candidate.ID)
	if calls != 0 || req.auditID != 0 || report.CurrentAttemptAudit == nil ||
		report.CurrentAttemptAudit.Status != "started" || !report.LatestAuditMatchesCurrentAttempt {
		t.Fatalf("audit ACK loss dispatched or discarded durable evidence: calls=%d report=%#v", calls, report)
	}
}

func TestStaleCancelledOrUncertainAttemptCannotStartDispatchAudit(t *testing.T) {
	f, candidates, first := newGenerationAuditFixture(t)
	ctx := context.Background()
	audits := agentrepository.NewGenerationAuditRepository(f.db)
	if err := candidates.CancelMediaGeneration(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if err := audits.RecordGenerationAudit(ctx, newStartedAttemptAudit(first)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("cancelled attempt obtained dispatch audit: %v", err)
	}
	second, err := candidates.ClaimMediaGeneration(ctx, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := audits.RecordGenerationAudit(ctx, newStartedAttemptAudit(first)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("superseded attempt obtained dispatch audit: %v", err)
	}
	if _, err := candidates.RecordMediaGenerationError(ctx, second.ID, second.GenerationAttempt,
		domain.MediaGenerationOutcomeUncertainCode, "manual reconciliation required"); err != nil {
		t.Fatal(err)
	}
	if err := audits.RecordGenerationAudit(ctx, newStartedAttemptAudit(second)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("uncertain attempt obtained new dispatch audit: %v", err)
	}
}

func TestAttemptAuditSurvivesCandidateDeletionWithoutInventingAnotherIdentity(t *testing.T) {
	f, _, candidate := newGenerationAuditFixture(t)
	ctx := context.Background()
	audit := newStartedAttemptAudit(candidate)
	if err := agentrepository.NewGenerationAuditRepository(f.db).RecordGenerationAudit(ctx, audit); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.ExecContext(ctx, `DELETE FROM ai_media_candidates WHERE id=$1`, candidate.ID); err != nil {
		t.Fatal(err)
	}
	var candidateID sql.NullInt64
	var attempt int
	if err := f.db.QueryRowContext(ctx, `SELECT media_candidate_id,generation_attempt FROM ai_generation_audits WHERE id=$1`, audit.ID).Scan(&candidateID, &attempt); err != nil {
		t.Fatal(err)
	}
	if candidateID.Valid || attempt != candidate.GenerationAttempt {
		t.Fatalf("candidate deletion erased or reassigned attempt evidence: candidate=%v attempt=%d", candidateID, attempt)
	}
}
