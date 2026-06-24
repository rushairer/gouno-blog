package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
)

type PostController struct {
	svc *service.PostService
}

func NewPostController(svc *service.PostService) *PostController {
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(tags))
}

type CreateCommentRequest struct {
	Author  string `json:"author" binding:"required"`
	Content string `json:"content" binding:"required"`
}

func (ctrl *PostController) CreateComment(c *gin.Context) {
	postIDStr := c.Param("slugOrID")
	postID, err := strconv.ParseInt(postIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
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
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(comment))
}

func (ctrl *PostController) GetComments(c *gin.Context) {
	postIDStr := c.Param("slugOrID")
	postID, err := strconv.ParseInt(postIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid post id"))
		return
	}

	comments, err := ctrl.svc.GetComments(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(comments))
}

func (ctrl *PostController) DeleteComment(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid comment id"))
		return
	}

	if err := ctrl.svc.DeleteComment(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, err.Error()))
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}
