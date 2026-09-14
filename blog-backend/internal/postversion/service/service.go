package service

import (
	"context"
	"database/sql"
	"errors"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"

	postversiondomain "github.com/rushairer/blog-backend/internal/postversion/domain"
)

var (
	ErrPostNotFound   = errors.New("文章不存在或已被删除")
	ErrInvalidPostID  = errors.New("invalid post id")
	ErrInvalidVersion = errors.New("invalid version")
)

type Service interface {
	ListVersions(context.Context, int64) ([]*postversiondomain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*postdomain.Post, error)
}

type VersionReader interface {
	ListVersions(context.Context, int64) ([]*postversiondomain.PostVersion, error)
}

type Restorer interface {
	RestoreVersion(context.Context, int64, int64) (*postdomain.Post, error)
}

type postVersionService struct {
	versions VersionReader
	restorer Restorer
}

func New(versions VersionReader, restorer Restorer) Service {
	return &postVersionService{versions: versions, restorer: restorer}
}

func (s *postVersionService) ListVersions(ctx context.Context, postID int64) ([]*postversiondomain.PostVersion, error) {
	if postID <= 0 {
		return nil, ErrInvalidPostID
	}
	return s.versions.ListVersions(ctx, postID)
}

func (s *postVersionService) RestoreVersion(ctx context.Context, postID, versionID int64) (*postdomain.Post, error) {
	if postID <= 0 || versionID <= 0 {
		return nil, ErrInvalidVersion
	}
	post, err := s.restorer.RestoreVersion(ctx, postID, versionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPostNotFound
	}
	return post, err
}
