package service

import (
	"context"
	"errors"

	analyticsrepository "github.com/rushairer/blog-backend/internal/analytics/repository"
	"github.com/rushairer/blog-backend/internal/domain"
)

var ErrInvalidPostID = errors.New("invalid post id")

// Service owns analytics business behavior. Persistence remains in the
// capability repository and HTTP/tool adapters remain outside this package.
type Service interface {
	RecordView(context.Context, int64, string) error
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

type analyticsService struct {
	repo analyticsrepository.Repository
}

func New(repo analyticsrepository.Repository) Service {
	return &analyticsService{repo: repo}
}

func (s *analyticsService) RecordView(ctx context.Context, postID int64, actorKey string) error {
	if postID <= 0 {
		return ErrInvalidPostID
	}
	return s.repo.RecordEvent(ctx, postID, "view", actorKey)
}

func (s *analyticsService) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	return s.repo.AnalyticsSummary(ctx)
}
