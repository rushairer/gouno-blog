package service

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
)

var (
	ErrCategoryNotFound     = taxonomyservice.ErrCategoryNotFound
	ErrCategorySlugInUse    = taxonomyservice.ErrCategorySlugInUse
	ErrInvalidCategoryID    = taxonomyservice.ErrInvalidCategoryID
	ErrCategoryNameRequired = taxonomyservice.ErrCategoryNameRequired
	ErrInvalidTagPayload    = taxonomyservice.ErrInvalidTagPayload
	ErrInvalidSettings      = siteservice.ErrInvalidSettings
	ErrSettingValueTooLong  = siteservice.ErrSettingValueTooLong
	ErrSiteTitleEmpty       = siteservice.ErrSiteTitleEmpty
	ErrInvalidRSSURL        = siteservice.ErrInvalidRSSURL
	ErrInvalidGithubURL     = siteservice.ErrInvalidGithubURL
	ErrInvalidFaviconURL    = siteservice.ErrInvalidFaviconURL
)

type CategoryRequest = taxonomyservice.CategoryRequest

// TagService is retained while controller/router consumers migrate to the
// capability-owned taxonomy service.
type TagService = taxonomyservice.TagService

// SettingService is retained while controller/router consumers migrate to the
// capability-owned site service.
type SettingService = siteservice.Service

// CategoryService is the transitional composite contract consumed by the
// legacy flat ContentController and FeedController. New code should depend on
// taxonomy or site services directly rather than on this aggregate.
type CategoryService interface {
	taxonomyservice.Service
	siteservice.Service
}

type categoryService struct {
	taxonomy taxonomyservice.Service
	site     siteservice.Service
}

var _ CategoryService = (*categoryService)(nil)

func NewCategoryService(repo repository.CategoryRepository) CategoryService {
	return &categoryService{
		taxonomy: taxonomyservice.New(repo),
		site:     siteservice.New(repo),
	}
}

func (s *categoryService) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return s.taxonomy.ListCategories(ctx)
}

func (s *categoryService) ListCategoryPosts(ctx context.Context, slug string, page, pageSize int) ([]domain.Post, int, error) {
	return s.taxonomy.ListCategoryPosts(ctx, slug, page, pageSize)
}

func (s *categoryService) CreateCategory(ctx context.Context, req *CategoryRequest) (*domain.Category, error) {
	return s.taxonomy.CreateCategory(ctx, req)
}

func (s *categoryService) UpdateCategory(ctx context.Context, id int64, req *CategoryRequest) error {
	return s.taxonomy.UpdateCategory(ctx, id, req)
}

func (s *categoryService) DeleteCategory(ctx context.Context, id int64) error {
	return s.taxonomy.DeleteCategory(ctx, id)
}

func (s *categoryService) ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error) {
	return s.taxonomy.ListPublishedTagSummaries(ctx)
}

func (s *categoryService) ListAdminTags(ctx context.Context) ([]domain.TagSummary, error) {
	return s.taxonomy.ListAdminTags(ctx)
}

func (s *categoryService) RenameTag(ctx context.Context, oldName, newName string) error {
	return s.taxonomy.RenameTag(ctx, oldName, newName)
}

func (s *categoryService) DeleteTag(ctx context.Context, name string) error {
	return s.taxonomy.DeleteTag(ctx, name)
}

func (s *categoryService) MergeTags(ctx context.Context, source, target string) error {
	return s.taxonomy.MergeTags(ctx, source, target)
}

func (s *categoryService) GetSiteSettings(ctx context.Context) (map[string]string, error) {
	return s.site.GetSiteSettings(ctx)
}

func (s *categoryService) UpdateSiteSettings(ctx context.Context, requested map[string]string) (map[string]string, error) {
	return s.site.UpdateSiteSettings(ctx, requested)
}

// ValidSiteURL remains as a compatibility shim while the flat ContentController
// still owns site settings HTTP handling.
func ValidSiteURL(value string, allowPath bool) bool {
	return siteservice.ValidSiteURL(value, allowPath)
}
