package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type GrowthController struct {
	growth     *service.GrowthService
	posts      *service.PostService
	postPolicy access.PostPolicy
}

// NewGrowthController retains the third argument only as migration compatibility
// until Post Version HTTP ownership leaves the legacy Growth controller.
func NewGrowthController(growth *service.GrowthService, posts *service.PostService, _ any) *GrowthController {
	return &GrowthController{growth: growth, posts: posts}
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
