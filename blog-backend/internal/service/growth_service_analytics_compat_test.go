package service

import (
	"context"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type growthAnalyticsCompatStore struct {
	recordedPostID int64
	eventType      string
	actorKey       string
	summary        *domain.AnalyticsSummary
}

func (s *growthAnalyticsCompatStore) RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error) {
	return nil, nil
}

func (s *growthAnalyticsCompatStore) ListVersions(context.Context, int64) ([]*domain.PostVersion, error) {
	return nil, nil
}

func (s *growthAnalyticsCompatStore) RestoreVersion(context.Context, int64, int64) (*domain.Post, error) {
	return nil, nil
}

func (s *growthAnalyticsCompatStore) RecordEvent(_ context.Context, postID int64, eventType, actorKey string) error {
	s.recordedPostID = postID
	s.eventType = eventType
	s.actorKey = actorKey
	return nil
}

func (s *growthAnalyticsCompatStore) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	return s.summary, nil
}

func TestGrowthServicePreservesLegacyAnalyticsCompatibility(t *testing.T) {
	store := &growthAnalyticsCompatStore{summary: &domain.AnalyticsSummary{TotalPosts: 3}}
	svc := NewGrowthService(store)
	ctx := context.Background()

	if err := svc.RecordView(ctx, 0, "actor"); err != ErrInvalidPostID {
		t.Fatalf("RecordView invalid id error=%v, want legacy ErrInvalidPostID", err)
	}
	if store.recordedPostID != 0 || store.eventType != "" {
		t.Fatalf("invalid view reached compatibility store: postID=%d event=%q", store.recordedPostID, store.eventType)
	}

	if err := svc.RecordView(ctx, 11, "client|agent"); err != nil {
		t.Fatalf("RecordView valid error=%v", err)
	}
	if store.recordedPostID != 11 || store.eventType != "view" || store.actorKey != "client|agent" {
		t.Fatalf("recorded event=(%d,%q,%q), want (11,view,client|agent)", store.recordedPostID, store.eventType, store.actorKey)
	}

	summary, err := svc.AnalyticsSummary(ctx)
	if err != nil || summary != store.summary {
		t.Fatalf("AnalyticsSummary=%#v err=%v, want original summary", summary, err)
	}
}
