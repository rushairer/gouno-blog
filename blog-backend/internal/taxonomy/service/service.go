package service

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	taxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"
)

var (
	ErrCategoryNotFound     = taxonomyrepository.ErrCategoryNotFound
	ErrCategorySlugInUse    = taxonomyrepository.ErrDuplicateSlug
	ErrInvalidCategoryID    = errors.New("无效的分类 ID")
	ErrCategoryNameRequired = errors.New("分类名称和有效的英文别名 (Slug) 均为必填项")
	ErrInvalidTagPayload    = errors.New("无效的标签数据")
)

var categorySlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type CategoryRequest struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
}

type TagService interface {
	ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error)
	ListAdminTags(ctx context.Context) ([]domain.TagSummary, error)
	RenameTag(ctx context.Context, oldName, newName string) error
	DeleteTag(ctx context.Context, name string) error
	MergeTags(ctx context.Context, source, target string) error
}

// Service owns Category and Tag business behavior for the taxonomy capability.
type Service interface {
	ListCategories(ctx context.Context) ([]domain.Category, error)
	ListCategoryPosts(ctx context.Context, slug string, page, pageSize int) ([]domain.Post, int, error)
	CreateCategory(ctx context.Context, req *CategoryRequest) (*domain.Category, error)
	UpdateCategory(ctx context.Context, id int64, req *CategoryRequest) error
	DeleteCategory(ctx context.Context, id int64) error

	TagService
}

type taxonomyService struct {
	repo taxonomyrepository.Repository
}

func New(repo taxonomyrepository.Repository) Service {
	return &taxonomyService{repo: repo}
}

func (s *taxonomyService) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return s.repo.ListCategories(ctx)
}

func (s *taxonomyService) ListCategoryPosts(ctx context.Context, slug string, page, pageSize int) ([]domain.Post, int, error) {
	cat, err := s.repo.GetCategoryBySlug(ctx, slug)
	if err != nil {
		return nil, 0, err
	}
	return s.repo.ListCategoryPosts(ctx, cat.ID, page, pageSize)
}

func (s *taxonomyService) CreateCategory(ctx context.Context, req *CategoryRequest) (*domain.Category, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" || !categorySlugPattern.MatchString(req.Slug) {
		return nil, ErrCategoryNameRequired
	}
	item := &domain.Category{
		Name:        name,
		Slug:        req.Slug,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	}
	if err := s.repo.CreateCategory(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *taxonomyService) UpdateCategory(ctx context.Context, id int64, req *CategoryRequest) error {
	if id <= 0 {
		return ErrInvalidCategoryID
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || !categorySlugPattern.MatchString(req.Slug) {
		return ErrCategoryNameRequired
	}
	item := &domain.Category{
		ID:          id,
		Name:        name,
		Slug:        req.Slug,
		Description: req.Description,
		SortOrder:   req.SortOrder,
	}
	return s.repo.UpdateCategory(ctx, item)
}

func (s *taxonomyService) DeleteCategory(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrInvalidCategoryID
	}
	return s.repo.DeleteCategory(ctx, id)
}

func (s *taxonomyService) ListAdminTags(ctx context.Context) ([]domain.TagSummary, error) {
	return s.repo.ListAdminTags(ctx)
}

func (s *taxonomyService) ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error) {
	return s.repo.ListPublishedTagSummaries(ctx)
}

func (s *taxonomyService) RenameTag(ctx context.Context, oldName, newName string) error {
	trimmed := strings.TrimSpace(newName)
	if trimmed == "" || strings.TrimSpace(oldName) == "" {
		return ErrInvalidTagPayload
	}
	return s.repo.RenameTag(ctx, oldName, trimmed)
}

func (s *taxonomyService) DeleteTag(ctx context.Context, name string) error {
	if strings.TrimSpace(name) == "" {
		return ErrInvalidTagPayload
	}
	return s.repo.DeleteTag(ctx, name)
}

func (s *taxonomyService) MergeTags(ctx context.Context, source, target string) error {
	if source == "" || target == "" || source == target {
		return ErrInvalidTagPayload
	}
	return s.repo.MergeTags(ctx, source, target)
}
