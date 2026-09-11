package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
	"github.com/rushairer/gouno"
)

// Controller owns Category and Tag HTTP behavior for the taxonomy capability.
type Controller struct {
	svc taxonomyservice.Service
}

func New(svc taxonomyservice.Service) *Controller {
	return &Controller{svc: svc}
}

func (ctrl *Controller) ListCategories(c *gin.Context) {
	items, err := ctrl.svc.ListCategories(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) ListPublishedTagSummaries(c *gin.Context) {
	items, err := ctrl.svc.ListPublishedTagSummaries(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) ListCategoryPosts(c *gin.Context) {
	page, pageSize := controllerutil.ExtractPagination(c, 10)

	posts, total, err := ctrl.svc.ListCategoryPosts(c.Request.Context(), c.Param("slug"), page, pageSize)
	if err != nil {
		if errors.Is(err, taxonomyservice.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	controllerutil.WritePaginated(c, posts, total, page, pageSize)
}

func (ctrl *Controller) CreateCategory(c *gin.Context) {
	var req taxonomyservice.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	item, err := ctrl.svc.CreateCategory(c.Request.Context(), &req)
	if err != nil {
		if errors.Is(err, taxonomyservice.ErrCategoryNameRequired) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(item))
}

func (ctrl *Controller) UpdateCategory(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req taxonomyservice.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "name and a valid lowercase slug are required"))
		return
	}
	err := ctrl.svc.UpdateCategory(c.Request.Context(), id, &req)
	if err != nil {
		if errors.Is(err, taxonomyservice.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		if errors.Is(err, taxonomyservice.ErrCategoryNameRequired) || errors.Is(err, taxonomyservice.ErrInvalidCategoryID) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) DeleteCategory(c *gin.Context) {
	id, ok := controllerutil.ParamPositiveID(c, "id")
	if !ok {
		return
	}
	err := ctrl.svc.DeleteCategory(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, taxonomyservice.ErrCategoryNotFound) {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "category not found"))
			return
		}
		if errors.Is(err, taxonomyservice.ErrInvalidCategoryID) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) ListAdminTags(c *gin.Context) {
	items, err := ctrl.svc.ListAdminTags(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *Controller) RenameTag(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "new tag name is required"))
		return
	}
	err := ctrl.svc.RenameTag(c.Request.Context(), c.Param("name"), req.Name)
	if err != nil {
		if errors.Is(err, taxonomyservice.ErrInvalidTagPayload) {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "new tag name is required"))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) DeleteTag(c *gin.Context) {
	err := ctrl.svc.DeleteTag(c.Request.Context(), c.Param("name"))
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *Controller) MergeTags(c *gin.Context) {
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
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}
