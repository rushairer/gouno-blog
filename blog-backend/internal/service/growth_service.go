package service

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
)

type GrowthStore interface {
	mediarepository.Repository
	RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error)
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
	RecordEvent(context.Context, int64, string, string) error
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

var (
	ErrMediaInUse          = mediaservice.ErrMediaInUse
	ErrInvalidVersion      = errors.New("invalid version")
	ErrInvalidMediaPayload = mediaservice.ErrInvalidMediaPayload
	ErrInvalidMediaID      = mediaservice.ErrInvalidMediaID
)

type GrowthService struct {
	store GrowthStore
	media mediaservice.Service
}

func NewGrowthService(store GrowthStore) *GrowthService {
	return &GrowthService{store: store, media: mediaservice.New(store)}
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

func (s *GrowthService) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	return s.media.CreateMedia(ctx, asset)
}

func (s *GrowthService) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	asset, err := s.media.GetMedia(ctx, id)
	return asset, legacyMediaError(err)
}

func (s *GrowthService) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	return s.media.ListMedia(ctx, filter)
}

func (s *GrowthService) UpdateMedia(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	asset, err := s.media.UpdateMedia(ctx, id, altText, updatedByPrincipalID)
	return asset, legacyMediaError(err)
}

func (s *GrowthService) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	asset, err := s.media.DeleteMedia(ctx, id)
	return asset, legacyMediaError(err)
}

func (s *GrowthService) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	return s.media.CountMediaReferences(ctx, id)
}

func (s *GrowthService) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
	return s.media.ListMediaReferences(ctx, id)
}

func legacyMediaError(err error) error {
	if errors.Is(err, mediaservice.ErrMediaNotFound) {
		return ErrPostNotFound
	}
	return err
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
