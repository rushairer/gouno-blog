package service

import (
	"context"
	"testing"

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
	summary *domain.AnalyticsSummary
}

func (s *growthAnalyticsCompatService) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	return s.summary, nil
}

func TestGrowthServicePreservesLegacyAnalyticsSummaryCompatibility(t *testing.T) {
	analytics := &growthAnalyticsCompatService{summary: &domain.AnalyticsSummary{TotalPosts: 3}}
	svc := NewGrowthService(&growthAnalyticsCompatStore{}, analytics)

	summary, err := svc.AnalyticsSummary(context.Background())
	if err != nil || summary != analytics.summary {
		t.Fatalf("AnalyticsSummary=%#v err=%v, want original summary", summary, err)
	}
}
