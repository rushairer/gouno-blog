package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
)

type ContentController struct {
	svc service.CategoryService
}

func NewContentController(svc service.CategoryService) *ContentController {
	return &ContentController{svc: svc}
}

func validSiteURL(value string, allowPath bool) bool {
	return service.ValidSiteURL(value, allowPath)
}

func (ctrl *ContentController) ListCategories(c *gin.Context) {
	items, err := ctrl.svc.ListCategories(c.Request.Context())
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *ContentController) ListCategoryPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	page, pageSize = normalizedPagination(page, pageSize, 10)

	posts, total, err := ctrl.svc.ListCategoryPosts(c.Request.Context(), c.Param("slug"), page, pageSize)
	if err != nil {
		if errors.Is(err, service.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": posts, "total": total, "page": page, "pageSize": pageSize}))
}

func (ctrl *ContentController) GetAdminPost(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
		return
	}
	post, err := ctrl.svc.GetAdminPost(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPostNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *ContentController) BatchPosts(c *gin.Context) {
	var req struct {
		IDs    []int64 `json:"ids"`
		Action string  `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "between 1 and 100 post ids are required"))
		return
	}
	affected, err := ctrl.svc.BatchPosts(c.Request.Context(), req.IDs, req.Action)
	if err != nil {
		if errors.Is(err, service.ErrBatchInvalidIDs) || errors.Is(err, service.ErrBatchInvalidAction) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"affected": affected}))
}

func (ctrl *ContentController) CreateCategory(c *gin.Context) {
	var req service.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	item, err := ctrl.svc.CreateCategory(c.Request.Context(), &req)
	if err != nil {
		if errors.Is(err, service.ErrCategoryNameRequired) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(item))
}

func (ctrl *ContentController) UpdateCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid category id"))
		return
	}
	var req service.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	err = ctrl.svc.UpdateCategory(c.Request.Context(), id, &req)
	if err != nil {
		if errors.Is(err, service.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		if errors.Is(err, service.ErrCategoryNameRequired) || errors.Is(err, service.ErrInvalidCategoryID) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) DeleteCategory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid category id"))
		return
	}
	err = ctrl.svc.DeleteCategory(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		if errors.Is(err, service.ErrInvalidCategoryID) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) ListAdminTags(c *gin.Context) {
	items, err := ctrl.svc.ListAdminTags(c.Request.Context())
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *ContentController) RenameTag(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "new tag name is required"))
		return
	}
	err := ctrl.svc.RenameTag(c.Request.Context(), c.Param("name"), req.Name)
	if err != nil {
		if errors.Is(err, service.ErrInvalidTagPayload) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "new tag name is required"))
			return
		}
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) DeleteTag(c *gin.Context) {
	err := ctrl.svc.DeleteTag(c.Request.Context(), c.Param("name"))
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) MergeTags(c *gin.Context) {
	var req struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Source == "" || req.Target == "" || req.Source == req.Target {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "distinct source and target tags are required"))
		return
	}
	err := ctrl.svc.MergeTags(c.Request.Context(), req.Source, req.Target)
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *ContentController) GetSiteSettings(c *gin.Context) {
	settings, err := ctrl.svc.GetSiteSettings(c.Request.Context())
	if err != nil {
		writeContentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}

func (ctrl *ContentController) UpdateSiteSettings(c *gin.Context) {
	var requested map[string]string
	if err := c.ShouldBindJSON(&requested); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid settings payload"))
		return
	}
	settings, err := ctrl.svc.UpdateSiteSettings(c.Request.Context(), requested)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrSettingValueTooLong),
			errors.Is(err, service.ErrSiteTitleEmpty),
			errors.Is(err, service.ErrInvalidRSSURL),
			errors.Is(err, service.ErrInvalidGithubURL):
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		default:
			writeContentError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}

func writeContentError(c *gin.Context, err error) {
	if errors.Is(err, service.ErrCategorySlugInUse) {
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "slug or name is already in use"))
		return
	}
	c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "internal server error"))
}
