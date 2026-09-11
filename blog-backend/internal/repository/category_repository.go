package repository

import (
	"database/sql"

	siterepository "github.com/rushairer/blog-backend/internal/site/repository"
	taxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"
)

var (
	ErrCategoryNotFound = taxonomyrepository.ErrCategoryNotFound
	ErrDuplicateSlug    = taxonomyrepository.ErrDuplicateSlug
)

// CategoryReader is retained while category/tag consumers migrate to the
// capability-owned taxonomy repository.
type CategoryReader = taxonomyrepository.CategoryReader

// CategoryWriter is retained while category/tag consumers migrate to the
// capability-owned taxonomy repository.
type CategoryWriter = taxonomyrepository.CategoryWriter

// TagRepository is retained while tag consumers migrate to the
// capability-owned taxonomy repository.
type TagRepository = taxonomyrepository.TagRepository

// SettingRepository is retained while settings consumers migrate to the
// capability-owned site repository.
type SettingRepository = siterepository.Repository

// CategoryRepository is the transitional composite contract consumed by the
// legacy flat CategoryService. New code should depend on taxonomy or site
// repositories directly rather than on this cross-capability aggregate.
type CategoryRepository interface {
	taxonomyrepository.Repository
	siterepository.Repository
}

type categoryRepository struct {
	taxonomyrepository.Repository
	SettingRepository
}

func NewCategoryRepository(db *sql.DB) CategoryRepository {
	return &categoryRepository{
		Repository:        taxonomyrepository.New(db),
		SettingRepository: siterepository.New(db),
	}
}

func NewTagRepository(db *sql.DB) TagRepository {
	return taxonomyrepository.New(db)
}

func NewSettingRepository(db *sql.DB) SettingRepository {
	return siterepository.New(db)
}
