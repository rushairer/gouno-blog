package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type interactionStoreStub struct {
	task      *domain.WorkflowInteractionTask
	cancelled bool
}

func (s *interactionStoreStub) GetInteraction(context.Context, int64) (*domain.WorkflowInteractionTask, error) {
	return s.task, nil
}
func (s *interactionStoreStub) ListInteractions(context.Context, int64) ([]*domain.WorkflowInteractionTask, error) {
	return []*domain.WorkflowInteractionTask{s.task}, nil
}
func (s *interactionStoreStub) ListPendingInteractions(context.Context) ([]*domain.WorkflowInteractionTask, error) {
	return []*domain.WorkflowInteractionTask{s.task}, nil
}
func (s *interactionStoreStub) ResolveInteraction(context.Context, int64, string, json.RawMessage, int64) (*domain.WorkflowInteractionTask, error) {
	return s.task, nil
}
func (s *interactionStoreStub) CancelInteraction(context.Context, int64, string, int64) error {
	s.cancelled = true
	return nil
}
func (s *interactionStoreStub) ListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {
	return []*domain.WorkflowRunEvent{}, nil
}

type interactionLifecycleStub struct {
	resumed   int64
	cancelled int64
	resumeErr error
	cancelErr error
}

func (s *interactionLifecycleStub) Resume(_ context.Context, id int64) error {
	s.resumed = id
	return s.resumeErr
}
func (s *interactionLifecycleStub) Cancel(_ context.Context, id int64) error {
	s.cancelled = id
	return s.cancelErr
}

func TestInteractionServiceOwnsResolveAndResumeOrchestration(t *testing.T) {
	runID := int64(77)
	store := &interactionStoreStub{task: &domain.WorkflowInteractionTask{WorkflowRunID: &runID}}
	lifecycle := &interactionLifecycleStub{resumeErr: sql.ErrNoRows}
	service := NewInteractionService(store, lifecycle)
	item, err := service.ResolveInteraction(context.Background(), 1, "token", json.RawMessage(`{"answer":true}`), 42)
	if err != nil || item != store.task || lifecycle.resumed != runID {
		t.Fatalf("item=%#v resumed=%d err=%v", item, lifecycle.resumed, err)
	}
}

func TestInteractionServiceOwnsCancelAndRunCancellation(t *testing.T) {
	runID := int64(88)
	store := &interactionStoreStub{task: &domain.WorkflowInteractionTask{WorkflowRunID: &runID}}
	lifecycle := &interactionLifecycleStub{cancelErr: sql.ErrNoRows}
	service := NewInteractionService(store, lifecycle)
	if err := service.CancelInteraction(context.Background(), 2, "token", 42); err != nil {
		t.Fatal(err)
	}
	if !store.cancelled || lifecycle.cancelled != runID {
		t.Fatalf("store.cancelled=%v lifecycle.cancelled=%d", store.cancelled, lifecycle.cancelled)
	}
}
