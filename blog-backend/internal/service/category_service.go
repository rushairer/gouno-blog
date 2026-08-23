package service

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
)

var (
	ErrCategoryNotFound     = repository.ErrCategoryNotFound
	ErrCategorySlugInUse    = repository.ErrDuplicateSlug
	ErrInvalidCategoryID    = errors.New("invalid category id")
	ErrCategoryNameRequired = errors.New("name and a valid lowercase slug are required")
	ErrInvalidTagPayload    = errors.New("invalid tag payload")
	ErrInvalidSettings      = errors.New("invalid settings payload")
	ErrSettingValueTooLong  = errors.New("site setting value is too long")
	ErrSiteTitleEmpty       = errors.New("site title cannot be empty")
	ErrInvalidRSSURL        = errors.New("rss_url must be a site path or an http(s) URL")
	ErrInvalidGithubURL     = errors.New("github_url must be an http(s) URL")
)

var categorySlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

var allowedSettingKeys = map[string]bool{
	"site_title": true, "site_description": true, "author_name": true, "author_bio": true,
	"email": true, "github_url": true, "rss_url": true, "default_seo_title": true, "default_seo_description": true,
	"footer_text": true, "hero_title": true, "hero_description": true, "hero_image_url": true,
	"hero_image_caption": true,
}

const maxSiteSettingLength = 4_096

type CategoryRequest struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	SortOrder   int    `json:"sort_order"`
}

// TagService handles tag management business logic.
type TagService interface {
	ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error)
	ListAdminTags(ctx context.Context) ([]domain.TagSummary, error)
	RenameTag(ctx context.Context, oldName, newName string) error
	DeleteTag(ctx context.Context, name string) error
	MergeTags(ctx context.Context, source, target string) error
}

// SettingService handles site settings management business logic.
type SettingService interface {
	GetSiteSettings(ctx context.Context) (map[string]string, error)
	UpdateSiteSettings(ctx context.Context, requested map[string]string) (map[string]string, error)
}

// CategoryService handles category, tag, and setting business operations.
type CategoryService interface {
	ListCategories(ctx context.Context) ([]domain.Category, error)
	ListCategoryPosts(ctx context.Context, slug string, page, pageSize int) ([]domain.Post, int, error)
	CreateCategory(ctx context.Context, req *CategoryRequest) (*domain.Category, error)
	UpdateCategory(ctx context.Context, id int64, req *CategoryRequest) error
	DeleteCategory(ctx context.Context, id int64) error

	TagService
	SettingService
}

type categoryService struct {
	repo repository.CategoryRepository
}

func NewCategoryService(repo repository.CategoryRepository) CategoryService {
	return &categoryService{repo: repo}
}

func (s *categoryService) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return s.repo.ListCategories(ctx)
}

func (s *categoryService) ListCategoryPosts(ctx context.Context, slug string, page, pageSize int) ([]domain.Post, int, error) {
	cat, err := s.repo.GetCategoryBySlug(ctx, slug)
	if err != nil {
		return nil, 0, err
	}
	return s.repo.ListCategoryPosts(ctx, cat.ID, page, pageSize)
}

func (s *categoryService) CreateCategory(ctx context.Context, req *CategoryRequest) (*domain.Category, error) {
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

func (s *categoryService) UpdateCategory(ctx context.Context, id int64, req *CategoryRequest) error {
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

func (s *categoryService) DeleteCategory(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrInvalidCategoryID
	}
	return s.repo.DeleteCategory(ctx, id)
}

func (s *categoryService) ListAdminTags(ctx context.Context) ([]domain.TagSummary, error) {
	return s.repo.ListAdminTags(ctx)
}

func (s *categoryService) ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error) {
	return s.repo.ListPublishedTagSummaries(ctx)
}

func (s *categoryService) RenameTag(ctx context.Context, oldName, newName string) error {
	trimmed := strings.TrimSpace(newName)
	if trimmed == "" || strings.TrimSpace(oldName) == "" {
		return ErrInvalidTagPayload
	}
	return s.repo.RenameTag(ctx, oldName, trimmed)
}

func (s *categoryService) DeleteTag(ctx context.Context, name string) error {
	if strings.TrimSpace(name) == "" {
		return ErrInvalidTagPayload
	}
	return s.repo.DeleteTag(ctx, name)
}

func (s *categoryService) MergeTags(ctx context.Context, source, target string) error {
	if source == "" || target == "" || source == target {
		return ErrInvalidTagPayload
	}
	return s.repo.MergeTags(ctx, source, target)
}

func (s *categoryService) GetSiteSettings(ctx context.Context) (map[string]string, error) {
	return s.repo.GetSiteSettings(ctx)
}

func ValidSiteURL(value string, allowPath bool) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	if allowPath && strings.HasPrefix(value, "/") {
		return !strings.HasPrefix(value, "//") && !strings.Contains(value, "\\") && parsed.Host == ""
	}
	return (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

func validSiteURL(value string, allowPath bool) bool {
	return ValidSiteURL(value, allowPath)
}

func (s *categoryService) UpdateSiteSettings(ctx context.Context, requested map[string]string) (map[string]string, error) {
	clean := make(map[string]string, len(requested))
	for key, value := range requested {
		if allowedSettingKeys[key] {
			if len([]rune(value)) > maxSiteSettingLength {
				return nil, ErrSettingValueTooLong
			}
			clean[key] = strings.TrimSpace(value)
		}
	}
	if title, exists := clean["site_title"]; exists && title == "" {
		return nil, ErrSiteTitleEmpty
	}
	if rss, exists := clean["rss_url"]; exists {
		if rss == "" {
			clean["rss_url"] = "/feed.xml"
		} else if !validSiteURL(rss, true) {
			return nil, ErrInvalidRSSURL
		}
	}
	if githubURL, exists := clean["github_url"]; exists && githubURL != "" && !validSiteURL(githubURL, false) {
		return nil, ErrInvalidGithubURL
	}
	return s.repo.UpdateSiteSettings(ctx, clean)
}
