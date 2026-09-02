package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
)

type CommunityController struct {
	svc             *service.CommunityService
	limiter         service.RateLimiter
	fallbackLimiter service.RateLimiter
	visitorTokens   *service.VisitorTokenManager
	logger          *zap.Logger
}

func NewCommunityController(svc *service.CommunityService, limiter service.RateLimiter, visitorSecret string, logger *zap.Logger) *CommunityController {
	if logger == nil {
		logger = zap.L()
	}
	return &CommunityController{
		svc:             svc,
		limiter:         limiter,
		fallbackLimiter: service.NewMemoryRateLimiter(),
		visitorTokens:   service.NewVisitorTokenManager(visitorSecret),
		logger:          logger,
	}
}

func (ctrl *CommunityController) actor(c *gin.Context) service.Actor {
	if principal, ok := c.Get("blog_principal_id"); ok {
		if principalID, principalOK := principal.(int64); principalOK && principalID > 0 {
			name := "Member"
			if rawClaims, exists := c.Get("claims"); exists {
				if claims, ok := rawClaims.(jwt.MapClaims); ok {
					for _, claim := range []string{"name", "preferred_username"} {
						if value, ok := claims[claim].(string); ok && strings.TrimSpace(value) != "" {
							name = strings.TrimSpace(value)
							break
						}
					}
				}
			}
			return service.Actor{Key: "principal:" + strconv.FormatInt(principalID, 10), PrincipalID: principalID, DisplayName: name, Authenticated: true}
		}
	}
	visitorID := ctrl.visitorID(c)
	return service.Actor{Key: "anon:" + visitorID, DisplayName: "Anonymous"}
}

func (ctrl *CommunityController) visitorID(c *gin.Context) string {
	if cookie, err := c.Cookie("blog_visitor"); err == nil {
		if id, valid := ctrl.visitorTokens.Verify(cookie); valid {
			return id
		}
	}
	id := ctrl.visitorTokens.GenerateVisitorID(c.ClientIP())
	http.SetCookie(c.Writer, &http.Cookie{
		Name: "blog_visitor", Value: id + "." + ctrl.visitorTokens.Sign(id), Path: "/",
		MaxAge: 365 * 24 * 60 * 60, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
	})
	return id
}

func (ctrl *CommunityController) allow(c *gin.Context, operation string, actor service.Actor, limit int, window time.Duration) bool {
	key := operation + ":" + actor.Key + ":" + c.ClientIP()
	limiter := ctrl.limiter
	if limiter == nil {
		limiter = ctrl.fallbackLimiter
	}
	allowed, err := limiter.Allow(c.Request.Context(), key, limit, window)
	if err != nil {
		ctrl.logger.Warn("community primary rate limiter unavailable; using in-process fallback", zap.Error(err))
		allowed, err = ctrl.fallbackLimiter.Allow(c.Request.Context(), key, limit, window)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gouno.NewErrorResponse(http.StatusServiceUnavailable, "interaction rate limiter unavailable"))
			return false
		}
	}
	if !allowed {
		c.JSON(http.StatusTooManyRequests, gouno.NewErrorResponse(http.StatusTooManyRequests, "too many requests; please try again later"))
	}
	return allowed
}

type createCommunityCommentRequest struct {
	ParentID *int64 `json:"parent_id"`
	Author   string `json:"author"`
	Content  string `json:"content" binding:"required"`
}

func (ctrl *CommunityController) CreateComment(c *gin.Context) {
	actor := ctrl.actor(c)
	if !ctrl.allow(c, "comment", actor, 5, 5*time.Minute) {
		return
	}
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	var req createCommunityCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	comment, err := ctrl.svc.CreateComment(c.Request.Context(), post.ID, req.ParentID, actor, req.Author, req.Content)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(comment))
}

func (ctrl *CommunityController) GetComments(c *gin.Context) {
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	comments, err := ctrl.svc.GetComments(c.Request.Context(), post.ID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *CommunityController) State(c *gin.Context) {
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	state, err := ctrl.svc.State(c.Request.Context(), post.ID, ctrl.actor(c))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(state))
}

func (ctrl *CommunityController) Like(c *gin.Context) {
	actor := ctrl.actor(c)
	if !ctrl.allow(c, "like", actor, 30, time.Minute) {
		return
	}
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	state, err := ctrl.svc.SetLike(c.Request.Context(), post.ID, actor, true)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(state))
}

func (ctrl *CommunityController) Unlike(c *gin.Context) {
	actor := ctrl.actor(c)
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	state, err := ctrl.svc.SetLike(c.Request.Context(), post.ID, actor, false)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(state))
}

type reportCommentRequest struct {
	Reason string `json:"reason"`
}

func (ctrl *CommunityController) ReportComment(c *gin.Context) {
	actor := ctrl.actor(c)
	if !ctrl.allow(c, "report", actor, 10, time.Hour) {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}
	var req reportCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.svc.ReportComment(c.Request.Context(), id, actor, req.Reason); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(nil))
}

func principalID(c *gin.Context) int64 {
	v, _ := c.Get("blog_principal_id")
	id, _ := v.(int64)
	return id
}

func (ctrl *CommunityController) ListNotifications(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "30"))
	page, pageSize = normalizedPagination(page, pageSize, 30)
	items, unread, err := ctrl.svc.ListNotifications(c.Request.Context(), principalID(c), page, pageSize)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list":      items,
		"unread":    unread,
		"page":      page,
		"page_size": pageSize,
		"pageSize":  pageSize,
	}))
}

func (ctrl *CommunityController) ReadNotification(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.ReadNotification(c.Request.Context(), principalID(c), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) ReadAllNotifications(c *gin.Context) {
	if err := ctrl.svc.ReadAllNotifications(c.Request.Context(), principalID(c)); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) DeleteNotification(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteNotification(c.Request.Context(), principalID(c), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

type batchDeleteNotificationsRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

func (ctrl *CommunityController) BatchDeleteNotifications(c *gin.Context) {
	var req batchDeleteNotificationsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.svc.DeleteNotifications(c.Request.Context(), principalID(c), req.IDs); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) ClearNotifications(c *gin.Context) {
	onlyRead, _ := strconv.ParseBool(c.DefaultQuery("only_read", "false"))
	count, err := ctrl.svc.ClearNotifications(c.Request.Context(), principalID(c), onlyRead)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"deleted_count": count}))
}

func (ctrl *CommunityController) ListAdminComments(c *gin.Context) {
	page, pageSize := ExtractPagination(c, 50)
	reported, _ := strconv.ParseBool(c.DefaultQuery("reported", "false"))
	items, total, err := ctrl.svc.ListAdminComments(c.Request.Context(), c.DefaultQuery("status", "pending"), reported, page, pageSize)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	WritePaginated(c, items, total, page, pageSize)
}

type moderateCommentRequest struct {
	Status string `json:"status" binding:"required"`
}

func (ctrl *CommunityController) ModerateComment(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	var req moderateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.svc.ModerateComment(c.Request.Context(), id, req.Status); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) DeleteComment(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.DeleteComment(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}
