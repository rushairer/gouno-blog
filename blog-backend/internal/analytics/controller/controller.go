package controller

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/analytics/service"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/gouno"
)

type publishedPostResolver interface {
	ResolvePublishedPost(context.Context, string) (*domain.Post, error)
}

type Controller struct {
	service service.Service
	posts   publishedPostResolver
}

func New(service service.Service, posts publishedPostResolver) *Controller {
	return &Controller{service: service, posts: posts}
}

func (ctrl *Controller) TrackView(c *gin.Context) {
	post, err := ctrl.posts.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	actor := c.ClientIP() + "|" + c.GetHeader("User-Agent")
	if err := ctrl.service.RecordView(c.Request.Context(), post.ID, actor); err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) Summary(c *gin.Context) {
	summary, err := ctrl.service.AnalyticsSummary(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(summary))
}
