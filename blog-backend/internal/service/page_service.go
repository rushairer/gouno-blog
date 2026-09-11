package service

import (
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	"github.com/rushairer/blog-backend/internal/repository"
)

var (
	ErrPageNotFound   = pageservice.ErrPageNotFound
	ErrInvalidSlug    = pageservice.ErrInvalidSlug
	ErrReservedSlug   = pageservice.ErrReservedSlug
	ErrPageTitleEmpty = pageservice.ErrPageTitleEmpty
	ErrDuplicateSlug  = pageservice.ErrDuplicateSlug
)

// PageService is retained as a compatibility alias while callers migrate to the capability-owned package.
type PageService = pageservice.PageService

func NewPageService(repo *repository.PageRepository) *PageService {
	return pageservice.NewPageService(repo)
}

func NormalizeSlug(slug string) string {
	return pageservice.NormalizeSlug(slug)
}

func IsReservedSlug(slug string) bool {
	return pageservice.IsReservedSlug(slug)
}

func ValidateSlug(slug string) error {
	return pageservice.ValidateSlug(slug)
}
