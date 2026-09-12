package service

import postservice "github.com/rushairer/blog-backend/internal/post/service"

var (
	ErrPostNotFound       = postservice.ErrPostNotFound
	ErrSlugInUse          = postservice.ErrSlugInUse
	ErrPostTitleEmpty     = postservice.ErrPostTitleEmpty
	ErrPostContentEmpty   = postservice.ErrPostContentEmpty
	ErrInvalidPostStatus  = postservice.ErrInvalidPostStatus
	ErrScheduledPast      = postservice.ErrScheduledPast
	ErrInvalidPostID      = postservice.ErrInvalidPostID
	ErrInvalidPostSlug    = postservice.ErrInvalidPostSlug
	ErrBatchInvalidIDs    = postservice.ErrBatchInvalidIDs
	ErrBatchInvalidAction = postservice.ErrBatchInvalidAction
)

type PostRepository = postservice.PostRepository
type PostService = postservice.PostService

func NewPostService(repo PostRepository) *PostService {
	return postservice.NewPostService(repo)
}
