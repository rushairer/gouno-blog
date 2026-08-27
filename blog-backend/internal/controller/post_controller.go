package controller

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

type BlogService interface {
	CreatePost(ctx context.Context, post *domain.Post) error
	UpdatePost(ctx context.Context, post *domain.Post) error
	DeletePost(ctx context.Context, id int64) error
	GetPost(ctx context.Context, id int64) (*domain.Post, error)
	GetAdminPost(ctx context.Context, id int64) (*domain.Post, error)
	GetAdminPostBySlug(ctx context.Context, slug string) (*domain.Post, error)
	BatchPosts(ctx context.Context, ids []int64, action string) (int64, error)
	GetPostBySlug(ctx context.Context, slug string) (*domain.Post, error)
	ResolvePostID(ctx context.Context, slugOrID string) (int64, error)
	IncrementViews(ctx context.Context, id int64) error
	IncrementLikes(ctx context.Context, id int64) error
	ListPosts(ctx context.Context, tag, search string, page, pageSize int) ([]*domain.Post, int, error)
	ListAdminPosts(ctx context.Context, filter domain.AdminPostFilter, page, pageSize int) ([]*domain.Post, int, error)
	ListTags(ctx context.Context) ([]string, error)
	CreateComment(ctx context.Context, comment *domain.Comment) error
	GetComments(ctx context.Context, postID int64) ([]*domain.Comment, error)
	GetAllComments(ctx context.Context, postID int64) ([]*domain.Comment, error)
	SetCommentVisibility(ctx context.Context, id int64, isVisible bool) error
	DeleteComment(ctx context.Context, id int64) error
}

type PostController struct {
	svc    BlogService
	policy access.PostPolicy
}

func NewPostController(svc BlogService) *PostController {
	return &PostController{svc: svc}
}

type CreatePostRequest struct {
	Title          string            `json:"title" binding:"required"`
	Slug           string            `json:"slug"`
	Summary        string            `json:"summary"`
	Content        string            `json:"content"`
	Tags           []string          `json:"tags"`
	Status         domain.PostStatus `json:"status"`
	ScheduledAt    *time.Time        `json:"scheduled_at"`
	CategoryID     *int64            `json:"category_id"`
	CoverURL       string            `json:"cover_url"`
	CoverAlt       string            `json:"cover_alt"`
	SEOTitle       string            `json:"seo_title"`
	SEODescription string            `json:"seo_description"`
}

func (ctrl *PostController) Create(c *gin.Context) {
	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteValidationError(c, err)
		return
	}

	post := &domain.Post{
		Title:          req.Title,
		Slug:           req.Slug,
		Summary:        req.Summary,
		Content:        req.Content,
		Tags:           req.Tags,
		Status:         req.Status,
		ScheduledAt:    req.ScheduledAt,
		CategoryID:     req.CategoryID,
		CoverURL:       req.CoverURL,
		CoverAlt:       req.CoverAlt,
		SEOTitle:       req.SEOTitle,
		SEODescription: req.SEODescription,
	}

	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		if allowed, reason := ctrl.policy.CanCreate(&snapshot); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
		if snapshot.Principal.ID > 0 {
			post.CreatedByPrincipalID = &snapshot.Principal.ID
			post.UpdatedByPrincipalID = &snapshot.Principal.ID
		}
	}

	if err := ctrl.svc.CreatePost(c.Request.Context(), post); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) Update(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		idStr = c.Param("slugOrID")
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
		return
	}

	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteValidationError(c, err)
		return
	}

	var existing *domain.Post
	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		var getErr error
		existing, getErr = ctrl.svc.GetAdminPost(c.Request.Context(), id)
		if getErr != nil {
			WriteDomainError(c, getErr)
			return
		}
		if existing == nil {
			c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
			return
		}
		if allowed, reason := ctrl.policy.CanEdit(&snapshot, existing); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}

	var createdBy *int64
	if existing != nil {
		createdBy = existing.CreatedByPrincipalID
	}

	post := &domain.Post{
		ID:                   id,
		Title:                req.Title,
		Slug:                 req.Slug,
		Summary:              req.Summary,
		Content:              req.Content,
		Tags:                 req.Tags,
		Status:               req.Status,
		ScheduledAt:          req.ScheduledAt,
		CategoryID:           req.CategoryID,
		CoverURL:             req.CoverURL,
		CoverAlt:             req.CoverAlt,
		SEOTitle:             req.SEOTitle,
		SEODescription:       req.SEODescription,
		CreatedByPrincipalID: createdBy,
	}
	if snapshot, ok := middleware.CurrentBlogAccess(c); ok && snapshot.Principal.ID > 0 {
		post.UpdatedByPrincipalID = &snapshot.Principal.ID
	}

	if err := ctrl.svc.UpdatePost(c.Request.Context(), post); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) ListAdmin(c *gin.Context) {
	page, pageSize := ExtractPagination(c, 50)
	filter := domain.AdminPostFilter{
		Query:    c.Query("q"),
		Status:   domain.PostStatus(c.Query("status")),
		Category: c.Query("category"),
		Tag:      c.Query("tag"),
	}

	if snapshot, ok := middleware.CurrentBlogAccess(c); ok {
		ctrl.policy.ScopePosts(&snapshot, &filter)
	}

	posts, total, err := ctrl.svc.ListAdminPosts(c.Request.Context(), filter, page, pageSize)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	WritePaginated(c, posts, total, page, pageSize)
}

func (ctrl *PostController) GetAdmin(c *gin.Context) {
	param := c.Param("id")
	var post *domain.Post
	var err error
	if id, parseErr := strconv.ParseInt(param, 10, 64); parseErr == nil && id > 0 {
		post, err = ctrl.svc.GetAdminPost(c.Request.Context(), id)
	} else {
		post, err = ctrl.svc.GetAdminPostBySlug(c.Request.Context(), param)
	}
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
		return
	}

	if snapshot, hasAccess := middleware.CurrentBlogAccess(c); hasAccess {
		if allowed, reason := ctrl.policy.CanView(&snapshot, post); !allowed {
			c.JSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, reason))
			return
		}
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) Batch(c *gin.Context) {
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
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"affected": affected}))
}

func (ctrl *PostController) Delete(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		idStr = c.Param("slugOrID")
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
		return
	}

	if err := ctrl.svc.DeletePost(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) Get(c *gin.Context) {
	slugOrID := c.Param("slugOrID")
	var snapshot *access.Snapshot
	if s, ok := middleware.CurrentBlogAccess(c); ok {
		snapshot = &s
	}

	// Try ID first
	id, err := strconv.ParseInt(slugOrID, 10, 64)
	var post *domain.Post
	if err == nil && id > 0 {
		post, err = ctrl.svc.GetAdminPost(c.Request.Context(), id)
		if err != nil && !errors.Is(err, service.ErrPostNotFound) {
			WriteDomainError(c, err)
			return
		}
		if post != nil {
			if allowed, _ := ctrl.policy.CanReadPost(snapshot, post); !allowed {
				c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
				return
			}
			c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
			return
		}
	}

	// Prefer an existing numeric ID, then fall back to a slug.
	post, err = ctrl.svc.GetAdminPostBySlug(c.Request.Context(), slugOrID)
	if err != nil && !errors.Is(err, service.ErrPostNotFound) {
		WriteDomainError(c, err)
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
		return
	}

	if allowed, _ := ctrl.policy.CanReadPost(snapshot, post); !allowed {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "post not found"))
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) List(c *gin.Context) {
	tag := c.Query("tag")
	search := c.Query("search")
	if search == "" {
		search = c.Query("q")
	}
	page, pageSize := ExtractPagination(c, 10)

	posts, total, err := ctrl.svc.ListPosts(c.Request.Context(), tag, search, page, pageSize)
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	WritePaginated(c, posts, total, page, pageSize)
}

func (ctrl *PostController) IncrementViews(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if err := ctrl.svc.IncrementViews(c.Request.Context(), postID); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) IncrementLikes(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	if err := ctrl.svc.IncrementLikes(c.Request.Context(), postID); err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) ListTags(c *gin.Context) {
	tags, err := ctrl.svc.ListTags(c.Request.Context())
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(tags))
}

type CreateCommentRequest struct {
	ParentID *int64 `json:"parent_id"`
	Author   string `json:"author" binding:"required"`
	Content  string `json:"content" binding:"required"`
}

type UpdateCommentVisibilityRequest struct {
	IsVisible bool `json:"is_visible"`
}

func (ctrl *PostController) CreateComment(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	comment := &domain.Comment{
		PostID:   postID,
		ParentID: req.ParentID,
		Author:   req.Author,
		Content:  req.Content,
	}

	if err := ctrl.svc.CreateComment(c.Request.Context(), comment); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(comment))
}

func (ctrl *PostController) GetComments(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	comments, err := ctrl.svc.GetComments(c.Request.Context(), postID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *PostController) GetAllComments(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	comments, err := ctrl.svc.GetAllComments(c.Request.Context(), postID)
	if err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *PostController) UpdateCommentVisibility(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}

	var req UpdateCommentVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	if err := ctrl.svc.SetCommentVisibility(c.Request.Context(), id, req.IsVisible); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{"id": id, "is_visible": req.IsVisible}))
}

func (ctrl *PostController) DeleteComment(c *gin.Context) {
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

