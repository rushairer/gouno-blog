package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
	"github.com/rushairer/gouno"
)

// Controller owns Site Settings HTTP behavior for the site capability.
type Controller struct {
	svc siteservice.Service
}

func New(svc siteservice.Service) *Controller {
	return &Controller{svc: svc}
}

func (ctrl *Controller) GetSiteSettings(c *gin.Context) {
	settings, err := ctrl.svc.GetSiteSettings(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}

func (ctrl *Controller) UpdateSiteSettings(c *gin.Context) {
	var requested map[string]string
	if err := c.ShouldBindJSON(&requested); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid settings payload"))
		return
	}
	settings, err := ctrl.svc.UpdateSiteSettings(c.Request.Context(), requested)
	if err != nil {
		switch {
		case errors.Is(err, siteservice.ErrSettingValueTooLong),
			errors.Is(err, siteservice.ErrSiteTitleEmpty),
			errors.Is(err, siteservice.ErrInvalidRSSURL),
			errors.Is(err, siteservice.ErrInvalidGithubURL),
			errors.Is(err, siteservice.ErrInvalidFaviconURL):
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
			return
		default:
			controllerutil.WriteDomainError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}
