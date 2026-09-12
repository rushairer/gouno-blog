package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
)

var (
	ErrMediaInUse          = mediarepository.ErrMediaInUse
	ErrMediaNotFound       = errors.New("media asset not found")
	ErrInvalidMediaPayload = errors.New("invalid media asset")
	ErrInvalidMediaID      = errors.New("invalid media id")
)

// Service owns media-asset validation and persistence coordination.
// Binary object storage remains outside this service in the parent media package.
type Service interface {
	CreateMedia(context.Context, *domain.MediaAsset) error
	GetMedia(context.Context, int64) (*domain.MediaAsset, error)
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	UpdateMedia(context.Context, int64, string, *int64) (*domain.MediaAsset, error)
	DeleteMedia(context.Context, int64) (*domain.MediaAsset, error)
	CountMediaReferences(context.Context, int64) (int64, error)
	ListMediaReferences(context.Context, int64) ([]*domain.MediaReference, error)
}

type mediaService struct {
	repo mediarepository.Repository
}

func New(repo mediarepository.Repository) Service {
	return &mediaService{repo: repo}
}

func (s *mediaService) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	if asset == nil || strings.TrimSpace(asset.Filename) == "" || strings.TrimSpace(asset.StorageName) == "" {
		return ErrInvalidMediaPayload
	}
	return s.repo.CreateMedia(ctx, asset)
}

func (s *mediaService) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.repo.GetMedia(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMediaNotFound
	}
	return asset, err
}

func (s *mediaService) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	return s.repo.ListMedia(ctx, filter)
}

func (s *mediaService) UpdateMedia(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.repo.UpdateMediaAltText(ctx, id, strings.TrimSpace(altText), updatedByPrincipalID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMediaNotFound
	}
	return asset, err
}

func (s *mediaService) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	asset, err := s.repo.DeleteMedia(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMediaNotFound
	}
	return asset, err
}

func (s *mediaService) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	if id <= 0 {
		return 0, ErrInvalidMediaID
	}
	return s.repo.CountMediaReferences(ctx, id)
}

func (s *mediaService) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
	if id <= 0 {
		return nil, ErrInvalidMediaID
	}
	return s.repo.ListMediaReferences(ctx, id)
}
