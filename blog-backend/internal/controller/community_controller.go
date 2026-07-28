package controller

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
)

type CommunityController struct {
	svc           *service.CommunityService
	limiter       service.RateLimiter
	visitorSecret []byte
}

func NewCommunityController(svc *service.CommunityService, limiter service.RateLimiter, visitorSecret string) *CommunityController {
	if visitorSecret == "" {
		visitorSecret = "gouno-blog-development-visitor-secret"
	}
	return &CommunityController{svc: svc, limiter: limiter, visitorSecret: []byte(visitorSecret)}
}

func (ctrl *CommunityController) actor(c *gin.Context) service.Actor {
	if subject, ok := c.Get("account_id"); ok {
		sub, _ := subject.(string)
		if sub != "" {
			name := sub
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
			return service.Actor{Key: "user:" + sub, Subject: sub, DisplayName: name, Authenticated: true}
		}
	}
	visitorID := ctrl.visitorID(c)
	return service.Actor{Key: "anon:" + visitorID, DisplayName: "Anonymous"}
}

func (ctrl *CommunityController) visitorID(c *gin.Context) string {
	if cookie, err := c.Cookie("blog_visitor"); err == nil {
		parts := strings.SplitN(cookie, ".", 2)
		if len(parts) == 2 && hmac.Equal([]byte(parts[1]), []byte(ctrl.sign(parts[0]))) {
			return parts[0]
		}
	}
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d-%s", time.Now().UnixNano(), c.ClientIP())))
		buf = sum[:18]
	}
	id := base64.RawURLEncoding.EncodeToString(buf)
	http.SetCookie(c.Writer, &http.Cookie{
		Name: "blog_visitor", Value: id + "." + ctrl.sign(id), Path: "/",
		MaxAge: 365 * 24 * 60 * 60, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
	})
	return id
}

func (ctrl *CommunityController) sign(value string) string {
	mac := hmac.New(sha256.New, ctrl.visitorSecret)
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (ctrl *CommunityController) allow(c *gin.Context, operation string, actor service.Actor, limit int, window time.Duration) bool {
	if ctrl.limiter == nil {
		return true
	}
	key := operation + ":" + actor.Key + ":" + c.ClientIP()
	allowed, err := ctrl.limiter.Allow(c.Request.Context(), key, limit, window)
	if err != nil {
		log.Printf("community rate limiter unavailable; allowing request: %v", err)
		return true
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
		writeCommunityError(c, err)
		return
	}
	var req createCommunityCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	comment, err := ctrl.svc.CreateComment(c.Request.Context(), post.ID, req.ParentID, actor, req.Author, req.Content)
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(comment))
}

func (ctrl *CommunityController) GetComments(c *gin.Context) {
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	comments, err := ctrl.svc.GetComments(c.Request.Context(), post.ID)
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *CommunityController) State(c *gin.Context) {
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	state, err := ctrl.svc.State(c.Request.Context(), post.ID, ctrl.actor(c))
	if err != nil {
		writeCommunityError(c, err)
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
		writeCommunityError(c, err)
		return
	}
	state, err := ctrl.svc.SetLike(c.Request.Context(), post.ID, actor, true)
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(state))
}

func (ctrl *CommunityController) Unlike(c *gin.Context) {
	actor := ctrl.actor(c)
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	state, err := ctrl.svc.SetLike(c.Request.Context(), post.ID, actor, false)
	if err != nil {
		writeCommunityError(c, err)
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
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(nil))
}

func subject(c *gin.Context) string {
	value, _ := c.Get("account_id")
	sub, _ := value.(string)
	return sub
}

func (ctrl *CommunityController) SetBookmark(c *gin.Context, bookmarked bool) {
	post, err := ctrl.svc.ResolvePublishedPost(c.Request.Context(), c.Param("postID"))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	if err := ctrl.svc.SetBookmark(c.Request.Context(), subject(c), post.ID, bookmarked); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"bookmarked": bookmarked}))
}

func (ctrl *CommunityController) ListBookmarks(c *gin.Context) {
	items, err := ctrl.svc.ListBookmarks(c.Request.Context(), subject(c))
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(items))
}

func (ctrl *CommunityController) ListNotifications(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "30"))
	items, unread, err := ctrl.svc.ListNotifications(c.Request.Context(), subject(c), page, pageSize)
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": items, "unread": unread, "page": page, "pageSize": pageSize}))
}

func (ctrl *CommunityController) ReadNotification(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid notification id"))
		return
	}
	if err := ctrl.svc.ReadNotification(c.Request.Context(), subject(c), id); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) ReadAllNotifications(c *gin.Context) {
	if err := ctrl.svc.ReadAllNotifications(c.Request.Context(), subject(c)); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) ListAdminComments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	reported, _ := strconv.ParseBool(c.DefaultQuery("reported", "false"))
	items, total, err := ctrl.svc.ListAdminComments(c.Request.Context(), c.DefaultQuery("status", "pending"), reported, page, pageSize)
	if err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"list": items, "total": total, "page": page, "pageSize": pageSize}))
}

type moderateCommentRequest struct {
	Status string `json:"status" binding:"required"`
}

type legacyVisibilityRequest struct {
	IsVisible bool `json:"is_visible"`
}

func (ctrl *CommunityController) ModerateComment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}
	var req moderateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	if err := ctrl.svc.ModerateComment(c.Request.Context(), id, req.Status); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) LegacyVisibility(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}
	var req legacyVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}
	status := "hidden"
	if req.IsVisible {
		status = "visible"
	}
	if err := ctrl.svc.ModerateComment(c.Request.Context(), id, status); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *CommunityController) DeleteComment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}
	if err := ctrl.svc.DeleteComment(c.Request.Context(), id); err != nil {
		writeCommunityError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func writeCommunityError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrPostNotFound), errors.Is(err, sql.ErrNoRows):
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, err.Error()))
	case errors.Is(err, repository.ErrDuplicateInteraction):
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, "interaction already recorded"))
	case isCommunityValidationError(err):
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
	default:
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
	}
}

func isCommunityValidationError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "must be") ||
		strings.Contains(message, "invalid ") ||
		strings.Contains(message, "belongs to another post") ||
		strings.Contains(message, "at most two levels") ||
		strings.Contains(message, "is too long") ||
		strings.Contains(message, "is required") ||
		strings.Contains(message, "not found")
}
