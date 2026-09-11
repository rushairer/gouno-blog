package repository

import (
	"database/sql"

	communityrepository "github.com/rushairer/blog-backend/internal/community/repository"
)

var (
	ErrDuplicateInteraction  = communityrepository.ErrDuplicateInteraction
	ErrParentCommentMismatch = communityrepository.ErrParentCommentMismatch
	ErrCommentDepthExceeded  = communityrepository.ErrCommentDepthExceeded
)

// CommunityRepository is retained as a compatibility alias while callers migrate to the capability-owned package.
type CommunityRepository = communityrepository.CommunityRepository

func NewCommunityRepository(db *sql.DB) *CommunityRepository {
	return communityrepository.NewCommunityRepository(db)
}
