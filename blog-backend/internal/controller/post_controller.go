package controller

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/gouno"
)

type BlogService interface {
	CreatePost(ctx context.Context, post *domain.Post) error
	UpdatePost(ctx context.Context, post *domain.Post) error
	DeletePost(ctx context.Context, id int64) error
	GetPost(ctx context.Context, id int64) (*domain.Post, error)
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
	svc BlogService
}

func NewPostController(svc BlogService) *PostController {
	return &PostController{svc: svc}
}

type CreatePostRequest struct {
	Title          string            `json:"title" binding:"required"`
	Slug           string            `json:"slug"`
	Summary        string            `json:"summary"`
	Content        string            `json:"content" binding:"required"`
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
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

	if err := ctrl.svc.CreatePost(c.Request.Context(), post); err != nil {
		writeServiceError(c, err)
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
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	post := &domain.Post{
		ID:             id,
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

	if err := ctrl.svc.UpdatePost(c.Request.Context(), post); err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) ListAdmin(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	page, pageSize = normalizedPagination(page, pageSize, 50)
	filter := domain.AdminPostFilter{
		Query:    c.Query("q"),
		Status:   domain.PostStatus(c.Query("status")),
		Category: c.Query("category"),
		Tag:      c.Query("tag"),
	}
	posts, total, err := ctrl.svc.ListAdminPosts(c.Request.Context(), filter, page, pageSize)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	WritePaginated(c, posts, total, page, pageSize)
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
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) Get(c *gin.Context) {
	slugOrID := c.Param("slugOrID")

	// Try ID first
	id, err := strconv.ParseInt(slugOrID, 10, 64)
	var post *domain.Post
	if err == nil {
		post, err = ctrl.svc.GetPost(c.Request.Context(), id)
		if err != nil {
			writeServiceError(c, err)
			return
		}
		if post != nil {
			c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
			return
		}
	}
	// Prefer an existing numeric ID, then fall back to a numeric slug.
	post, err = ctrl.svc.GetPostBySlug(c.Request.Context(), slugOrID)

	if err != nil {
		writeServiceError(c, err)
		return
	}
	if post == nil {
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
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	page, pageSize = normalizedPagination(page, pageSize, 10)

	posts, total, err := ctrl.svc.ListPosts(c.Request.Context(), tag, search, page, pageSize)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	WritePaginated(c, posts, total, page, pageSize)
}

func (ctrl *PostController) IncrementViews(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if err := ctrl.svc.IncrementViews(c.Request.Context(), postID); err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) IncrementLikes(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if err := ctrl.svc.IncrementLikes(c.Request.Context(), postID); err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func (ctrl *PostController) ListTags(c *gin.Context) {
	tags, err := ctrl.svc.ListTags(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
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
		writeServiceError(c, err)
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
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(comment))
}

func (ctrl *PostController) GetComments(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeServiceError(c, err)
		return
	}

	comments, err := ctrl.svc.GetComments(c.Request.Context(), postID)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *PostController) GetAllComments(c *gin.Context) {
	postID, err := ctrl.svc.ResolvePostID(c.Request.Context(), c.Param("slugOrID"))
	if err != nil {
		writeServiceError(c, err)
		return
	}

	comments, err := ctrl.svc.GetAllComments(c.Request.Context(), postID)
	if err != nil {
		writeServiceError(c, err)
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
		writeServiceError(c, err)
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
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func writeServiceError(c *gin.Context, err error) {
	WriteDomainError(c, err)
}
