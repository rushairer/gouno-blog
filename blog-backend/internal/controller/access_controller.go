package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type AccessController struct{ service *access.Service }

func NewAccessController(service *access.Service) *AccessController {
	return &AccessController{service: service}
}

func (ctrl *AccessController) Session(c *gin.Context) {
	snapshot, ok := middleware.CurrentBlogAccess(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gouno.NewErrorResponse(http.StatusUnauthorized, "invalid authentication"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(snapshot))
}

func (ctrl *AccessController) ListMembers(c *gin.Context) {
	members, err := ctrl.service.ListMembers(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"members": members}))
}

func (ctrl *AccessController) ListAudits(c *gin.Context) {
	audits, err := ctrl.service.ListAudits(c.Request.Context(), 100)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"audits": audits}))
}

type membershipRequest struct {
	Status string   `json:"status"`
	Roles  []string `json:"roles"`
	Reason string   `json:"reason"`
}

func (ctrl *AccessController) UpdateMember(c *gin.Context) {
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
	if err = ctrl.service.SetMember(c.Request.Context(), actor, principalID, req.Status, req.Roles, req.Reason, c.GetHeader("X-Request-ID"), c.ClientIP()); err != nil {
		status := http.StatusBadRequest
		if err == access.ErrForbidden || err == access.ErrOwnerOnly || err == access.ErrSelfEscalation || err == access.ErrLastOwner {
			status = http.StatusForbidden
		}
		c.JSON(status, gouno.NewErrorResponse(status, err.Error()))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"updated": true}))
}

func (ctrl *AccessController) TransferOwner(c *gin.Context) {
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
		c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, err.Error()))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"transferred": true}))
}
