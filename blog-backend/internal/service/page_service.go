package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
)

var (
	ErrPageNotFound     = errors.New("page not found")
	ErrInvalidSlug      = errors.New("invalid page slug")
	ErrReservedSlug     = errors.New("page slug is reserved by the system")
	ErrPageTitleEmpty   = errors.New("page title cannot be empty")
	ErrDuplicateSlug    = errors.New("page slug already exists")
)

var slugRegex = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

var reservedSlugs = map[string]bool{
	"admin":         true,
	"api":           true,
	"articles":      true,
	"posts":         true,
	"categories":    true,
	"tags":          true,
	"archive":       true,
	"search":        true,
	"login":         true,
	"callback":      true,
	"account":       true,
	"bookmarks":     true,
	"notifications": true,
	"settings":      true,
	"media":         true,
	"feed.xml":      true,
	"rss":           true,
	"sitemap.xml":   true,
	"robots.txt":    true,
	"favicon.ico":   true,
	"healthz":       true,
	"swagger":       true,
}

type PageService struct {
	repo *repository.PageRepository
}

func NewPageService(repo *repository.PageRepository) *PageService {
	return &PageService{repo: repo}
}

func NormalizeSlug(slug string) string {
	slug = strings.TrimSpace(strings.ToLower(slug))
	slug = strings.Trim(slug, "/")
	return slug
}

func IsReservedSlug(slug string) bool {
	return reservedSlugs[slug]
}

func ValidateSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("%w: slug cannot be empty", ErrInvalidSlug)
	}
	if IsReservedSlug(slug) {
		return fmt.Errorf("%w: '%s'", ErrReservedSlug, slug)
	}
	if !slugRegex.MatchString(slug) {
		return fmt.Errorf("%w: slug must contain only lowercase alphanumeric characters and hyphens", ErrInvalidSlug)
	}
	return nil
}

func (s *PageService) CreatePage(ctx context.Context, page *domain.Page) error {
	if strings.TrimSpace(page.Title) == "" {
		return ErrPageTitleEmpty
	}
	page.Slug = NormalizeSlug(page.Slug)
	if err := ValidateSlug(page.Slug); err != nil {
		return err
	}

	existing, err := s.repo.GetBySlug(ctx, page.Slug)
	if err == nil && existing != nil {
		return ErrDuplicateSlug
	}

	return s.repo.Create(ctx, page)
}

func (s *PageService) UpdatePage(ctx context.Context, page *domain.Page) error {
	if page.ID <= 0 {
		return ErrPageNotFound
	}
	if strings.TrimSpace(page.Title) == "" {
		return ErrPageTitleEmpty
	}
	page.Slug = NormalizeSlug(page.Slug)
	if err := ValidateSlug(page.Slug); err != nil {
		return err
	}

	existing, err := s.repo.GetBySlug(ctx, page.Slug)
	if err == nil && existing != nil && existing.ID != page.ID {
		return ErrDuplicateSlug
	}

	return s.repo.Update(ctx, page)
}

func (s *PageService) DeletePage(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrPageNotFound
	}
	return s.repo.Delete(ctx, id)
}

func (s *PageService) GetPage(ctx context.Context, id int64) (*domain.Page, error) {
	if id <= 0 {
		return nil, ErrPageNotFound
	}
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrPageNotFound
	}
	return p, nil
}

func (s *PageService) GetPageBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	slug = NormalizeSlug(slug)
	p, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, ErrPageNotFound
	}
	return p, nil
}

func (s *PageService) GetPublishedPageBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	slug = NormalizeSlug(slug)
	p, err := s.repo.GetPublishedBySlug(ctx, slug)
	if err != nil {
		return nil, ErrPageNotFound
	}
	return p, nil
}

func (s *PageService) ListPublishedNavPages(ctx context.Context) ([]*domain.Page, error) {
	return s.repo.ListPublishedNav(ctx)
}

func (s *PageService) ListPublishedPages(ctx context.Context) ([]*domain.Page, error) {
	return s.repo.ListPublished(ctx)
}

func (s *PageService) ListAdminPages(ctx context.Context, filter domain.AdminPageFilter, page, pageSize int) ([]*domain.Page, int, error) {
	return s.repo.ListAdmin(ctx, filter, page, pageSize)
}
