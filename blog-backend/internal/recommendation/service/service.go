package service

import (
	"context"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
	recommendationrepository "github.com/rushairer/blog-backend/internal/recommendation/repository"
)

var ErrPostNotFound = errors.New("文章不存在或已被删除")

type Service interface {
	RelatedPosts(context.Context, *domain.Post) ([]*domain.Post, error)
}

type recommendationService struct {
	repo recommendationrepository.Repository
}

func New(repo recommendationrepository.Repository) Service {
	return &recommendationService{repo: repo}
}

func (s *recommendationService) RelatedPosts(ctx context.Context, post *domain.Post) ([]*domain.Post, error) {
	if post == nil || post.ID <= 0 {
		return nil, ErrPostNotFound
	}
	if len(post.Tags) == 0 {
		return []*domain.Post{}, nil
	}
	return s.repo.RelatedPosts(ctx, post.ID, post.Tags, 4)
}
