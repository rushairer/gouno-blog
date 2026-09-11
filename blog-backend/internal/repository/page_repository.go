package repository

import (
	"database/sql"

	pagerepository "github.com/rushairer/blog-backend/internal/page/repository"
)

// PageRepository is retained as a compatibility alias while callers migrate to the capability-owned package.
type PageRepository = pagerepository.PageRepository

func NewPageRepository(db *sql.DB) *PageRepository {
	return pagerepository.NewPageRepository(db)
}
