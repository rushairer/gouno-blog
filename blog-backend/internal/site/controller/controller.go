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
		if message, ok := publicSiteSettingsError(err); ok {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, message))
			return
		}
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(settings))
}


// Existing localized validation messages are a public API contract, but only
// a recognized typed sentinel may select them. Wrapped errors can carry
// private DB or configuration details; their text must never be serialized.
func publicSiteSettingsError(err error) (string, bool) {
	for _, known := range []error{
		siteservice.ErrSettingValueTooLong,
		siteservice.ErrSiteTitleEmpty,
		siteservice.ErrInvalidRSSURL,
		siteservice.ErrInvalidGithubURL,
		siteservice.ErrInvalidFaviconURL,
	} {
		if errors.Is(err, known) {
			return known.Error(), true
		}
	}
	return "", false
}
