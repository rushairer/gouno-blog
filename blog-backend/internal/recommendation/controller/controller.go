package controller

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/domain"
	recommendationservice "github.com/rushairer/blog-backend/internal/recommendation/service"
	"github.com/rushairer/gouno"
)

type publishedPostResolver interface {
	ResolvePublishedPost(context.Context, string) (*domain.Post, error)
}

type Controller struct {
	service recommendationservice.Service
	posts   publishedPostResolver
}

func New(service recommendationservice.Service, posts publishedPostResolver) *Controller {
	return &Controller{service: service, posts: posts}
}

func (ctrl *Controller) RelatedPosts(c *gin.Context) {
	post, err := ctrl.posts.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	posts, err := ctrl.service.RelatedPosts(c.Request.Context(), post)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(posts))
}
