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

var ErrInvalidVersion = errors.New("invalid version")

type GrowthService struct {
	store GrowthStore
}

func NewGrowthService(store GrowthStore) *GrowthService {
	return &GrowthService{store: store}
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
