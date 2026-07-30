package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

type GrowthStore interface {
	RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error)
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
	CreateMedia(context.Context, *domain.MediaAsset) error
	ListMedia(context.Context) ([]*domain.MediaAsset, error)
	DeleteMedia(context.Context, int64) (*domain.MediaAsset, error)
	CountMediaReferences(context.Context, int64) (int64, error)
	RecordEvent(context.Context, int64, string, string) error
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

var ErrMediaInUse = errors.New("media asset is referenced by published or draft posts")

type GrowthService struct{ store GrowthStore }

func NewGrowthService(store GrowthStore) *GrowthService { return &GrowthService{store: store} }

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
		return nil, errors.New("invalid post id")
	}
	return s.store.ListVersions(ctx, postID)
}

func (s *GrowthService) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	if postID <= 0 || versionID <= 0 {
		return nil, errors.New("invalid version")
	}
	post, err := s.store.RestoreVersion(ctx, postID, versionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return post, err
}

func (s *GrowthService) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	if asset == nil || strings.TrimSpace(asset.Filename) == "" || strings.TrimSpace(asset.StorageName) == "" {
		return errors.New("invalid media asset")
	}
	return s.store.CreateMedia(ctx, asset)
}

func (s *GrowthService) ListMedia(ctx context.Context) ([]*domain.MediaAsset, error) {
	return s.store.ListMedia(ctx)
}

func (s *GrowthService) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, errors.New("invalid media id")
	}
	references, err := s.store.CountMediaReferences(ctx, id)
	if err != nil {
		return nil, err
	}
	if references > 0 {
		return nil, ErrMediaInUse
	}
	asset, err := s.store.DeleteMedia(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return asset, err
}

func (s *GrowthService) RecordView(ctx context.Context, postID int64, actorKey string) error {
	if postID <= 0 {
		return errors.New("invalid post id")
	}
	return s.store.RecordEvent(ctx, postID, "view", actorKey)
}

func (s *GrowthService) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	return s.store.AnalyticsSummary(ctx)
}
