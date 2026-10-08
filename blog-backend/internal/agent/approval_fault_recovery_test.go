package agent

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

// faultApprovalStore models durable approval state shared across requests.
type faultApprovalStore struct {
	ApprovalStore
	mu             sync.Mutex
	approval       domain.AgentApproval
	completionErr  error
	completions    int
}

func (s *faultApprovalStore) GetApproval(_ context.Context, id int64) (*domain.AgentApproval, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.approval.ID != id {
		return nil, sql.ErrNoRows
	}
	copy := s.approval
	return &copy, nil
}

func (s *faultApprovalStore) ClaimApproval(_ context.Context, id, _ int64, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.approval.ID != id || s.approval.Status != domain.ApprovalPending {
		return sql.ErrNoRows
	}
	s.approval.Status = domain.ApprovalApproved
	return nil
}

func (s *faultApprovalStore) CompleteApproval(_ context.Context, id int64, status domain.ApprovalStatus, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.completions++
	if s.completionErr != nil {
		return s.completionErr
	}
	if s.approval.ID != id {
		return sql.ErrNoRows
	}
	s.approval.Status = status
	return nil
}

func (s *faultApprovalStore) status() domain.ApprovalStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.approval.Status
}

type faultApprovalEffects struct {
	ApprovalEffectWriter
	mu sync.Mutex
	calls int
	responseErr error
}

func (s *faultApprovalEffects) CreateEditorialTask(context.Context, int64, string, string, string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return s.responseErr
}

func (s *faultApprovalEffects) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

func newFaultApprovalService() (*ApprovalService, *faultApprovalStore, *faultApprovalEffects) {
	store := &faultApprovalStore{approval: domain.AgentApproval{
		ID: 17, Status: domain.ApprovalPending,
		ActionType: "create_editorial_task",
		ProposedPayload: []byte(`{"title":"Review","description":"Draft","priority":"high"}`),
		ExpiresAt: time.Now().Add(time.Hour),
	}}
	effects := &faultApprovalEffects{}
	return &ApprovalService{approvals: store, effects: effects}, store, effects
}

func TestApprovalInDoubtAfterEffectCommittedButReplyLost(t *testing.T) {
	svc, store, effects := newFaultApprovalService()
	// The writer already committed its effect, but its DB reply was lost.
	effects.responseErr = errors.New("committed; connection lost before acknowledgement")
	err := svc.Approve(context.Background(), 17, 4, "review")
	if !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("error = %v, want uncertain outcome", err)
	}
	if store.status() != domain.ApprovalApproved || store.completions != 0 {
		t.Fatalf("in-doubt approval was made retryable: status=%s completions=%d", store.status(), store.completions)
	}
	if err := svc.Approve(context.Background(), 17, 4, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("retry error = %v, want conflict", err)
	}
	if effects.count() != 1 {
		t.Fatalf("business effects = %d, want exactly one attempted execution", effects.count())
	}
}

func TestApprovalInDoubtAfterFinalStatusWriteFails(t *testing.T) {
	svc, store, effects := newFaultApprovalService()
	store.completionErr = errors.New("database write acknowledgement lost")
	if err := svc.Approve(context.Background(), 17, 4, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("error = %v, want uncertain outcome", err)
	}
	if store.status() != domain.ApprovalApproved {
		t.Fatalf("status = %s, want in-doubt approved", store.status())
	}
	if err := svc.Approve(context.Background(), 17, 4, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("retry error = %v, want conflict", err)
	}
	if effects.count() != 1 {
		t.Fatalf("business effects = %d, want 1", effects.count())
	}
}

func TestApprovalExecutesOnceUnderConcurrentReviewers(t *testing.T) {
	svc, store, effects := newFaultApprovalService()
	const workers = 24
	var wg sync.WaitGroup
	result := make(chan error, workers)
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result <- svc.Approve(context.Background(), 17, 4, "review")
		}()
	}
	wg.Wait()
	close(result)
	var succeeded int
	for err := range result {
		if err == nil {
			succeeded++
		} else if !errors.Is(err, ErrApprovalConflict) {
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if succeeded != 1 || effects.count() != 1 || store.status() != domain.ApprovalExecuted {
		t.Fatalf("succeeded=%d effects=%d status=%s", succeeded, effects.count(), store.status())
	}
}

func TestExpiredApprovalDoesNotOverwriteConcurrentClaim(t *testing.T) {
	svc, store, effects := newFaultApprovalService()
	store.approval.ExpiresAt = time.Now().Add(-time.Minute)
	store.completionErr = sql.ErrNoRows // Other reviewer changed state before expiration update.
	if err := svc.Approve(context.Background(), 17, 4, "expired"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("expiration race error = %v, want conflict", err)
	}
	if effects.count() != 0 {
		t.Fatalf("expired approval executed %d effects", effects.count())
	}
}
