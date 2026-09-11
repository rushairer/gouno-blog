package service

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
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

// Compile-time compatibility documentation for the facade's public Page-oriented API.
var (
	_ func(context.Context, *domain.Page) error = (*PageService).CreatePage
	_ func(context.Context, *domain.Page) error = (*PageService).UpdatePage
)
