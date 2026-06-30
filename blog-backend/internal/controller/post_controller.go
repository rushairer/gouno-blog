package controller

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/gouno"
)

type BlogService interface {
	CreatePost(ctx context.Context, post *domain.Post) error
	UpdatePost(ctx context.Context, post *domain.Post) error
	DeletePost(ctx context.Context, id int64) error
	GetPost(ctx context.Context, id int64) (*domain.Post, error)
	GetPostBySlug(ctx context.Context, slug string) (*domain.Post, error)
	ResolvePostID(ctx context.Context, slugOrID string) (int64, error)
	ListPosts(ctx context.Context, tag string, page, pageSize int) ([]*domain.Post, int, error)
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
	Title   string   `json:"title" binding:"required"`
	Slug    string   `json:"slug"`
	Summary string   `json:"summary"`
	Content string   `json:"content" binding:"required"`
	Tags    []string `json:"tags"`
}

func (ctrl *PostController) Create(c *gin.Context) {
	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	post := &domain.Post{
		Title:   req.Title,
		Slug:    req.Slug,
		Summary: req.Summary,
		Content: req.Content,
		Tags:    req.Tags,
	}

	if err := ctrl.svc.CreatePost(c.Request.Context(), post); err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) Update(c *gin.Context) {
	idStr := c.Param("id")
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
		ID:      id,
		Title:   req.Title,
		Slug:    req.Slug,
		Summary: req.Summary,
		Content: req.Content,
		Tags:    req.Tags,
	}

	if err := ctrl.svc.UpdatePost(c.Request.Context(), post); err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(post))
}

func (ctrl *PostController) Delete(c *gin.Context) {
	idStr := c.Param("id")
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
	} else {
		// Treat as slug
		post, err = ctrl.svc.GetPostBySlug(c.Request.Context(), slugOrID)
	}

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
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	posts, total, err := ctrl.svc.ListPosts(c.Request.Context(), tag, page, pageSize)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list":     posts,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	}))
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
	Author  string `json:"author" binding:"required"`
	Content string `json:"content" binding:"required"`
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
		PostID:  postID,
		Author:  req.Author,
		Content: req.Content,
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
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
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
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}

	if err := ctrl.svc.DeleteComment(c.Request.Context(), id); err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrPostNotFound):
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, err.Error()))
	case errors.Is(err, service.ErrSlugInUse):
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, err.Error()))
	case isValidationError(err):
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
	default:
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
	}
}

func isValidationError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return msg == "post title cannot be empty" ||
		msg == "post content cannot be empty" ||
		msg == "invalid post ID" ||
		msg == "invalid post id" ||
		msg == "invalid post slug" ||
		msg == "invalid comment id" ||
		msg == "comment author cannot be empty" ||
		msg == "comment content cannot be empty"
}
