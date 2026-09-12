package service

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
)

type GrowthStore interface {
	RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error)
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
}

type analyticsSummaryReader interface {
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

var (
	ErrInvalidVersion       = errors.New("invalid version")
	ErrAnalyticsUnavailable = errors.New("analytics service unavailable")
)

type GrowthService struct {
	store     GrowthStore
	analytics analyticsSummaryReader
}

// NewGrowthService keeps a summary-only Analytics dependency temporarily while
// the legacy BlogTools source facade is migrated. Runtime HTTP ownership no
// longer depends on Growth for Analytics.
func NewGrowthService(store GrowthStore, analytics ...analyticsSummaryReader) *GrowthService {
	var analyticsReader analyticsSummaryReader
	if len(analytics) > 0 {
		analyticsReader = analytics[0]
	}
	return &GrowthService{store: store, analytics: analyticsReader}
}

func (s *GrowthService) RelatedPosts(ctx context.Context, post *domain.Post) ([]*domain.Post, error) {
	if post == nil || post.ID <= 0 {
		return nil, ErrPostNotFound
	}
	if len(post.Tags) == 0 {
		return []*domain.Post{}, nil
	}
	return s.store.RelatedPosts(ctx, post.ID, post.Tags, 4)
}

func (s *GrowthService) ListVersions(ctx context.Context, postID int64) ([]*domain.PostVersion, error) {
	if postID <= 0 {
		return nil, ErrInvalidPostID
	}
	return s.store.ListVersions(ctx, postID)
}

func (s *GrowthService) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	if postID <= 0 || versionID <= 0 {
		return nil, ErrInvalidVersion
	}
	post, err := s.store.RestoreVersion(ctx, postID, versionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return post, err
}

func (s *GrowthService) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	if s.analytics == nil {
		return nil, ErrAnalyticsUnavailable
	}
	return s.analytics.AnalyticsSummary(ctx)
}
