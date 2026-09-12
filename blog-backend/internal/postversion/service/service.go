package service

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
	postversionrepository "github.com/rushairer/blog-backend/internal/postversion/repository"
)

var (
	ErrPostNotFound   = errors.New("文章不存在或已被删除")
	ErrInvalidPostID  = errors.New("invalid post id")
	ErrInvalidVersion = errors.New("invalid version")
)

type Service interface {
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
}

type postVersionService struct {
	repo postversionrepository.Repository
}

func New(repo postversionrepository.Repository) Service {
	return &postVersionService{repo: repo}
}

func (s *postVersionService) ListVersions(ctx context.Context, postID int64) ([]*domain.PostVersion, error) {
	if postID <= 0 {
		return nil, ErrInvalidPostID
	}
	return s.repo.ListVersions(ctx, postID)
}

func (s *postVersionService) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	if postID <= 0 || versionID <= 0 {
		return nil, ErrInvalidVersion
	}
	post, err := s.repo.RestoreVersion(ctx, postID, versionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return post, err
}
