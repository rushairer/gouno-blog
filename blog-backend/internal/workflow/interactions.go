package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
)

type InteractionStore interface {
	GetInteraction(context.Context, int64) (*domain.WorkflowInteractionTask, error)
	ListInteractions(context.Context, int64) ([]*domain.WorkflowInteractionTask, error)
	ListPendingInteractions(context.Context) ([]*domain.WorkflowInteractionTask, error)
	ResolveInteraction(context.Context, int64, string, json.RawMessage, int64) (*domain.WorkflowInteractionTask, error)
	CancelInteraction(context.Context, int64, string, int64) error
	ListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)
}

type InteractionRunLifecycle interface {
	Resume(context.Context, int64) error
	Cancel(context.Context, int64) error
}

type InteractionService struct {
	store InteractionStore
	runs  InteractionRunLifecycle
}

func NewInteractionService(store InteractionStore, runs InteractionRunLifecycle) *InteractionService {
	if store == nil || runs == nil {
		panic("workflow.NewInteractionService: dependencies are required")
	}
	return &InteractionService{store: store, runs: runs}
}

func (s *InteractionService) GetInteraction(ctx context.Context, id int64) (*domain.WorkflowInteractionTask, error) {
	return s.store.GetInteraction(ctx, id)
}

func (s *InteractionService) ListInteractions(ctx context.Context, runID int64) ([]*domain.WorkflowInteractionTask, error) {
	return s.store.ListInteractions(ctx, runID)
}

func (s *InteractionService) ListPendingInteractions(ctx context.Context) ([]*domain.WorkflowInteractionTask, error) {
	return s.store.ListPendingInteractions(ctx)
}

func (s *InteractionService) ListWorkflowRunEvents(ctx context.Context, runID int64) ([]*domain.WorkflowRunEvent, error) {
	return s.store.ListWorkflowRunEvents(ctx, runID)
}

func (s *InteractionService) ResolveInteraction(ctx context.Context, id int64, token string, response json.RawMessage, principalID int64) (*domain.WorkflowInteractionTask, error) {
	item, err := s.store.ResolveInteraction(ctx, id, token, response, principalID)
	if err != nil {
		return nil, err
	}
	if item.WorkflowRunID != nil {
		if err := s.runs.Resume(ctx, *item.WorkflowRunID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	return item, nil
}

func (s *InteractionService) CancelInteraction(ctx context.Context, id int64, token string, principalID int64) error {
	item, err := s.store.GetInteraction(ctx, id)
	if err != nil {
		return err
	}
	if err := s.store.CancelInteraction(ctx, id, token, principalID); err != nil {
		return err
	}
	if item.WorkflowRunID != nil {
		if err := s.runs.Cancel(ctx, *item.WorkflowRunID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}
