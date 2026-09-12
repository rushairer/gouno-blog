package controller

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/internal/domain"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type adminPostReader interface {
	GetAdminPost(context.Context, int64) (*domain.Post, error)
}

type Controller struct {
	service    postversionservice.Service
	posts      adminPostReader
	postPolicy access.PostPolicy
}

func New(service postversionservice.Service, posts adminPostReader) *Controller {
	return &Controller{service: service, posts: posts}
}

func (ctrl *Controller) ListVersions(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if !ctrl.authorize(c, id, false) {
		return
	}
	versions, err := ctrl.service.ListVersions(c.Request.Context(), id)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(versions))
}

func (ctrl *Controller) RestoreVersion(c *gin.Context) {
	postID, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	versionID, ok := controllerutil.ParamPositiveID(c, "versionID")
	if !ok {
		return
	}
	if !ctrl.authorize(c, postID, true) {
		return
	}
	restored, err := ctrl.service.RestoreVersion(c.Request.Context(), postID, versionID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(restored))
}

func (ctrl *Controller) authorize(c *gin.Context, postID int64, restore bool) bool {
	snapshot, hasAccess := middleware.CurrentBlogAccess(c)
	if !hasAccess {
		return true
	}
	post, err := ctrl.posts.GetAdminPost(c.Request.Context(), postID)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return false
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
		return false
	}
	if restore {
		if allowed, reason := ctrl.postPolicy.CanRestoreVersion(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return false
		}
		return true
	}
	if allowed, reason := ctrl.postPolicy.CanView(&snapshot, post); !allowed {
		c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
		return false
	}
	return true
}
