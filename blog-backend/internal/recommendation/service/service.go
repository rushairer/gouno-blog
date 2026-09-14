package service

import (
	"context"
	"errors"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"

	recommendationrepository "github.com/rushairer/blog-backend/internal/recommendation/repository"
)

var ErrPostNotFound = errors.New("文章不存在或已被删除")

type Service interface {
	RelatedPosts(context.Context, *postdomain.Post) ([]*postdomain.Post, error)
}

type recommendationService struct {
	repo recommendationrepository.Repository
}

func New(repo recommendationrepository.Repository) Service {
	return &recommendationService{repo: repo}
}

func (s *recommendationService) RelatedPosts(ctx context.Context, post *postdomain.Post) ([]*postdomain.Post, error) {
	if post == nil || post.ID <= 0 {
		return nil, ErrPostNotFound
	}
	if len(post.Tags) == 0 {
		return []*postdomain.Post{}, nil
	}
	return s.repo.RelatedPosts(ctx, post.ID, post.Tags, 4)
}
