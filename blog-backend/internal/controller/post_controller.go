package controller

import postcontroller "github.com/rushairer/blog-backend/internal/post/controller"

// Post controller symbols remain as temporary compatibility aliases while the
// Router and remaining consumers migrate to the canonical Post capability.
type BlogService = postcontroller.BlogService
type PostController = postcontroller.PostController
type CreatePostRequest = postcontroller.CreatePostRequest

func NewPostController(svc BlogService) *PostController {
	return postcontroller.NewPostController(svc)
}
