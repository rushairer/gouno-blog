package service

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
)

// GrowthService is a temporary compatibility adapter for legacy Agent/Tool
// constructor signatures. It owns no business behavior; all version reads and
// restores delegate to the canonical Post Version capability.
type GrowthService struct {
	postVersions postversionservice.Service
}

func NewGrowthService(postVersions postversionservice.Service) *GrowthService {
	return &GrowthService{postVersions: postVersions}
}

func (s *GrowthService) ListVersions(ctx context.Context, postID int64) ([]*domain.PostVersion, error) {
	return s.postVersions.ListVersions(ctx, postID)
}

func (s *GrowthService) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	return s.postVersions.RestoreVersion(ctx, postID, versionID)
}
