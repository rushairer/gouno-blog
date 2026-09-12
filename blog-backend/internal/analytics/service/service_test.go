package service

import (
	"context"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type stubRepository struct {
	recordedPostID int64
	eventType      string
	actorKey       string
	recordErr      error
	summary        *domain.AnalyticsSummary
	summaryErr     error
}

func (r *stubRepository) RecordEvent(_ context.Context, postID int64, eventType, actorKey string) error {
	r.recordedPostID = postID
	r.eventType = eventType
	r.actorKey = actorKey
	return r.recordErr
}

func (r *stubRepository) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	return r.summary, r.summaryErr
}

func TestServiceRecordViewValidatesAndDelegates(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)
	ctx := context.Background()

	if err := svc.RecordView(ctx, 0, "actor"); !errors.Is(err, ErrInvalidPostID) {
		t.Fatalf("RecordView invalid id error=%v, want ErrInvalidPostID", err)
	}
	if repo.recordedPostID != 0 || repo.eventType != "" {
		t.Fatalf("invalid view reached repository: postID=%d event=%q", repo.recordedPostID, repo.eventType)
	}

	if err := svc.RecordView(ctx, 42, "client|agent"); err != nil {
		t.Fatalf("RecordView valid error=%v", err)
	}
	if repo.recordedPostID != 42 || repo.eventType != "view" || repo.actorKey != "client|agent" {
		t.Fatalf("recorded event=(%d,%q,%q), want (42,view,client|agent)", repo.recordedPostID, repo.eventType, repo.actorKey)
	}
}

func TestServicePreservesRepositoryErrorsAndSummary(t *testing.T) {
	recordErr := errors.New("record failed")
	summaryErr := errors.New("summary failed")
	repo := &stubRepository{recordErr: recordErr, summaryErr: summaryErr}
	svc := New(repo)
	ctx := context.Background()

	if err := svc.RecordView(ctx, 7, "actor"); !errors.Is(err, recordErr) {
		t.Fatalf("RecordView error=%v, want repository error", err)
	}
	if _, err := svc.AnalyticsSummary(ctx); !errors.Is(err, summaryErr) {
		t.Fatalf("AnalyticsSummary error=%v, want repository error", err)
	}

	expected := &domain.AnalyticsSummary{TotalPosts: 9, TotalViews: 100}
	repo.summaryErr = nil
	repo.summary = expected
	got, err := svc.AnalyticsSummary(ctx)
	if err != nil || got != expected {
		t.Fatalf("AnalyticsSummary=%#v err=%v, want original summary", got, err)
	}
}
