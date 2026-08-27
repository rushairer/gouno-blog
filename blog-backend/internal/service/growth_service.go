package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
)

type GrowthStore interface {
	RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error)
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
	CreateMedia(context.Context, *domain.MediaAsset) error
	GetMedia(context.Context, int64) (*domain.MediaAsset, error)
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	UpdateMediaAltText(context.Context, int64, string, *int64) (*domain.MediaAsset, error)
	DeleteMedia(context.Context, int64) (*domain.MediaAsset, error)
	CountMediaReferences(context.Context, int64) (int64, error)
	ListMediaReferences(context.Context, int64) ([]*domain.MediaReference, error)
	RecordEvent(context.Context, int64, string, string) error
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

var (
	ErrMediaInUse          = repository.ErrMediaInUse
	ErrInvalidVersion      = errors.New("invalid version")
	ErrInvalidMediaPayload = errors.New("invalid media asset")
	ErrInvalidMediaID      = errors.New("invalid media id")
)

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

func (s *GrowthService) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	if asset == nil || strings.TrimSpace(asset.Filename) == "" || strings.TrimSpace(asset.StorageName) == "" {
		return ErrInvalidMediaPayload
	}
	return s.store.CreateMedia(ctx, asset)
}

func (s *GrowthService) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.store.GetMedia(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return asset, err
}

func (s *GrowthService) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	return s.store.ListMedia(ctx, filter)
}

func (s *GrowthService) UpdateMedia(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.store.UpdateMediaAltText(ctx, id, strings.TrimSpace(altText), updatedByPrincipalID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return asset, err
}

func (s *GrowthService) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.store.DeleteMedia(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return asset, err
}

func (s *GrowthService) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	if id <= 0 {
		return 0, ErrInvalidMediaID
	}
	return s.store.CountMediaReferences(ctx, id)
}

func (s *GrowthService) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	return s.store.ListMediaReferences(ctx, id)
}

func (s *GrowthService) RecordView(ctx context.Context, postID int64, actorKey string) error {
	if postID <= 0 {
		return ErrInvalidPostID
	}
	return s.store.RecordEvent(ctx, postID, "view", actorKey)
}

func (s *GrowthService) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	return s.store.AnalyticsSummary(ctx)
}
