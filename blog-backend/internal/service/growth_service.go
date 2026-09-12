package service

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
	recommendationrepository "github.com/rushairer/blog-backend/internal/recommendation/repository"
	recommendationservice "github.com/rushairer/blog-backend/internal/recommendation/service"
)

type GrowthStore interface {
	recommendationrepository.Repository
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
}

var ErrInvalidVersion = errors.New("invalid version")

type GrowthService struct {
	store          GrowthStore
	recommendation recommendationservice.Service
}

func NewGrowthService(store GrowthStore) *GrowthService {
	return &GrowthService{store: store, recommendation: recommendationservice.New(store)}
}

func (s *GrowthService) RelatedPosts(ctx context.Context, post *domain.Post) ([]*domain.Post, error) {
	posts, err := s.recommendation.RelatedPosts(ctx, post)
	if errors.Is(err, recommendationservice.ErrPostNotFound) {
		return nil, ErrPostNotFound
	}
	return posts, err
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
