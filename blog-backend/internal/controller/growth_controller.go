package controller

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type publishedPostResolver interface {
	ResolvePublishedPost(context.Context, string) (*domain.Post, error)
}

type GrowthController struct {
	growth     *service.GrowthService
	posts      *service.PostService
	community  publishedPostResolver
	postPolicy access.PostPolicy
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community publishedPostResolver) *GrowthController {
	return &GrowthController{growth: growth, posts: posts, community: community}
}

func (ctrl *GrowthController) RelatedPosts(c *gin.Context) {
	post, err := ctrl.community.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	posts, err := ctrl.growth.RelatedPosts(c.Request.Context(), post)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(posts))
}

func (ctrl *GrowthController) ListVersions(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		post, err := ctrl.posts.GetAdminPost(c.Request.Context(), id)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if post == nil {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		if allowed, reason := ctrl.postPolicy.CanView(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}
	versions, err := ctrl.growth.ListVersions(c.Request.Context(), id)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(versions))
}

func (ctrl *GrowthController) RestoreVersion(c *gin.Context) {
	postID, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	versionID, ok := ParamPositiveID(c, "versionID")
	if !ok {
		return
	}
	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		post, err := ctrl.posts.GetAdminPost(c.Request.Context(), postID)
		if err != nil {
			WriteDomainError(c, err)
			return
		}
		if post == nil {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		if allowed, reason := ctrl.postPolicy.CanRestoreVersion(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}
	restored, err := ctrl.growth.RestoreVersion(c.Request.Context(), postID, versionID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(restored))
}
