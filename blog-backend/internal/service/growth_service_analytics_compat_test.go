package service

import (
	"context"
	"testing"

	analyticsservice "github.com/rushairer/blog-backend/internal/analytics/service"
	"github.com/rushairer/blog-backend/internal/domain"
)

type growthAnalyticsCompatStore struct{}

func (s *growthAnalyticsCompatStore) RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error) {
	return nil, nil
}

func (s *growthAnalyticsCompatStore) ListVersions(context.Context, int64) ([]*domain.PostVersion, error) {
	return nil, nil
}

func (s *growthAnalyticsCompatStore) RestoreVersion(context.Context, int64, int64) (*domain.Post, error) {
	return nil, nil
}

type growthAnalyticsCompatService struct {
	recordedPostID int64
	actorKey       string
	summary        *domain.AnalyticsSummary
}

func (s *growthAnalyticsCompatService) RecordView(_ context.Context, postID int64, actorKey string) error {
	if postID <= 0 {
		return analyticsservice.ErrInvalidPostID
	}
	s.recordedPostID = postID
	s.actorKey = actorKey
	return nil
}

func (s *growthAnalyticsCompatService) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	return s.summary, nil
}

func TestGrowthServicePreservesLegacyAnalyticsCompatibility(t *testing.T) {
	analytics := &growthAnalyticsCompatService{summary: &domain.AnalyticsSummary{TotalPosts: 3}}
	svc := NewGrowthService(&growthAnalyticsCompatStore{}, analytics)
	ctx := context.Background()

	if err := svc.RecordView(ctx, 0, "actor"); err != ErrInvalidPostID {
		t.Fatalf("RecordView invalid id error=%v, want legacy ErrInvalidPostID", err)
	}
	if analytics.recordedPostID != 0 {
		t.Fatalf("invalid view reached canonical Analytics service: postID=%d", analytics.recordedPostID)
	}

	if err := svc.RecordView(ctx, 11, "client|agent"); err != nil {
		t.Fatalf("RecordView valid error=%v", err)
	}
	if analytics.recordedPostID != 11 || analytics.actorKey != "client|agent" {
		t.Fatalf("recorded view=(%d,%q), want (11,client|agent)", analytics.recordedPostID, analytics.actorKey)
	}

	summary, err := svc.AnalyticsSummary(ctx)
	if err != nil || summary != analytics.summary {
		t.Fatalf("AnalyticsSummary=%#v err=%v, want original summary", summary, err)
	}
}
