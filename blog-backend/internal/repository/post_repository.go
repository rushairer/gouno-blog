package repository

import (
	"database/sql"

	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
)

// PostRepository is a temporary compatibility alias while Post consumers migrate
// to the canonical capability-owned repository.
type PostRepository = postrepository.PostRepository

func NewPostRepository(db *sql.DB) *PostRepository {
	return postrepository.NewPostRepository(db)
}
