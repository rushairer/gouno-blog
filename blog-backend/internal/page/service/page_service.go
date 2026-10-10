package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/rushairer/blog-backend/internal/page/domain"
	"github.com/rushairer/blog-backend/internal/page/repository"
)

var (
	ErrPageNotFound   = errors.New("单页不存在或已被删除")
	ErrInvalidSlug    = errors.New("无效的单页访问路径 (Slug)")
	ErrReservedSlug   = errors.New("该单页访问路径为系统保留路径，无法使用")
	ErrPageTitleEmpty = errors.New("单页标题不能为空")
	ErrDuplicateSlug  = errors.New("单页访问路径 (Slug) 已被占用")
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

// validatePageWrite is the single Slug/title policy used by regular product
// edits and approval-owned database transactions. Unexpected lookup errors must
// fail closed; sql.ErrNoRows means that the Slug is available.
func (s *PageService) validatePageWrite(
	ctx context.Context, page *domain.Page,
	getBySlug func(context.Context, string) (*domain.Page, error),
) error {
	if page == nil || strings.TrimSpace(page.Title) == "" {
		return ErrPageTitleEmpty
	}
	page.Slug = NormalizeSlug(page.Slug)
	if err := ValidateSlug(page.Slug); err != nil {
		return err
	}
	existing, err := getBySlug(ctx, page.Slug)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if existing != nil && (page.ID == 0 || existing.ID != page.ID) {
		return ErrDuplicateSlug
	}
	return nil
}

func (s *PageService) CreatePage(ctx context.Context, page *domain.Page) error {
	if err := s.validatePageWrite(ctx, page, s.repo.GetBySlug); err != nil {
		return err
	}
	return pageSaveError(s.repo.Create(ctx, page))
}

func (s *PageService) UpdatePage(ctx context.Context, page *domain.Page) error {
	if page == nil || page.ID <= 0 {
		return ErrPageNotFound
	}
	if err := s.validatePageWrite(ctx, page, s.repo.GetBySlug); err != nil {
		return err
	}
	return pageSaveError(s.repo.Update(ctx, page))
}

// pageSaveError prevents a concurrent duplicate-Slug insert/rename from
// surfacing the raw PostgreSQL uniqueness constraint in a public response.
func pageSaveError(err error) error {
	var sqlState interface{ SQLState() string }
	if errors.As(err, &sqlState) && sqlState.SQLState() == "23505" {
		return ErrDuplicateSlug
	}
	return err
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
