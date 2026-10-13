package controller

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/controllerutil"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type Controller struct{ service *access.Service }

func New(service *access.Service) *Controller {
	return &Controller{service: service}
}

// Access mutation errors are classified by typed domain sentinels, never by
// relaying err.Error(). In particular, PostgreSQL or authorization audit errors
// must not become HTTP 400/403 text with internal SQL details.
func writeAccessMutationError(c *gin.Context, err error) {
	status := http.StatusForbidden
	message := "forbidden"
	switch {
	case errors.Is(err, access.ErrForbidden):
	case errors.Is(err, access.ErrOwnerOnly):
		message = "owner role changes require an owner"
	case errors.Is(err, access.ErrSelfEscalation):
		message = "cannot grant owner to yourself"
	case errors.Is(err, access.ErrLastOwner):
		message = "cannot remove the last owner"
	case errors.Is(err, access.ErrInvalidMemberStatus), errors.Is(err, access.ErrInvalidMemberRole):
		status, message = http.StatusBadRequest, "invalid membership request"
	case errors.Is(err, access.ErrOwnerTargetNotActive):
		status, message = http.StatusBadRequest, "target must be an active member"
	default:
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(status, gouno.NewErrorResponse(status, message))
	c.Abort()
}

func (ctrl *Controller) Session(c *gin.Context) {
	snapshot, ok := middleware.CurrentBlogAccess(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authentication"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(snapshot))
}

func (ctrl *Controller) ListMembers(c *gin.Context) {
	members, err := ctrl.service.ListMembers(c.Request.Context())
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"members": members}))
}

func (ctrl *Controller) ListAudits(c *gin.Context) {
	audits, err := ctrl.service.ListAudits(c.Request.Context(), 100)
	if err != nil {
		controllerutil.WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"audits": audits}))
}

type membershipRequest struct {
	DisplayName *string  `json:"display_name,omitempty"`
	Status      string   `json:"status"`
	Roles       []string `json:"roles"`
	Reason      string   `json:"reason"`
}

func (ctrl *Controller) UpdateMember(c *gin.Context) {
	claimsRaw, ok := c.Get("claims")
	claims, valid := claimsRaw.(jwt.MapClaims)
	if !ok || !valid || !access.RecentMFA(claims, time.Now()) {
		c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "recent_mfa_required"))
		return
	}
	principalID, err := strconv.ParseInt(c.Param("principalID"), 10, 64)
	if err != nil || principalID < 1 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid principal id"))
		return
	}
	var req membershipRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid membership request"))
		return
	}
	actor, ok := middleware.CurrentBlogAccess(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authentication"))
		return
	}
	if err = ctrl.service.SetMember(c.Request.Context(), actor, principalID, req.DisplayName, req.Status, req.Roles, req.Reason, c.GetHeader("X-Request-ID"), c.ClientIP()); err != nil {
		writeAccessMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"updated": true}))
}

func (ctrl *Controller) TransferOwner(c *gin.Context) {
	claimsRaw, ok := c.Get("claims")
	claims, valid := claimsRaw.(jwt.MapClaims)
	if !ok || !valid || !access.RecentMFA(claims, time.Now()) {
		c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "recent_mfa_required"))
		return
	}
	principalID, err := strconv.ParseInt(c.Param("principalID"), 10, 64)
	var req struct {
		Reason string `json:"reason"`
	}
	if err == nil && c.Request.ContentLength != 0 {
		if err = c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid owner transfer"))
			return
		}
	}
	actor, exists := middleware.CurrentBlogAccess(c)
	if err != nil || principalID < 1 || !exists {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid owner transfer"))
		return
	}
	if err = ctrl.service.TransferOwner(c.Request.Context(), actor, principalID, req.Reason, c.GetHeader("X-Request-ID"), c.ClientIP()); err != nil {
		writeAccessMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"transferred": true}))
}
