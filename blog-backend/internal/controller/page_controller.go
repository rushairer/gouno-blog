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

type PageServiceInterface interface {
	CreatePage(ctx context.Context, page *domain.Page) error
	UpdatePage(ctx context.Context, page *domain.Page) error
	DeletePage(ctx context.Context, id int64) error
	GetPage(ctx context.Context, id int64) (*domain.Page, error)
	GetPageBySlug(ctx context.Context, slug string) (*domain.Page, error)
	GetPublishedPageBySlug(ctx context.Context, slug string) (*domain.Page, error)
	ListPublishedNavPages(ctx context.Context) ([]*domain.Page, error)
	ListPublishedPages(ctx context.Context) ([]*domain.Page, error)
	ListAdminPages(ctx context.Context, filter domain.AdminPageFilter, page, pageSize int) ([]*domain.Page, int, error)
}

type PageController struct {
	svc PageServiceInterface
}

func NewPageController(svc PageServiceInterface) *PageController {
	return &PageController{svc: svc}
}

type CreatePageRequest struct {
	Title          string            `json:"title" binding:"required"`
	Slug           string            `json:"slug" binding:"required"`
	Content        string            `json:"content"`
	Summary        string            `json:"summary"`
	Template       string            `json:"template"`
	Status         domain.PageStatus `json:"status"`
	AllowComments  bool              `json:"allow_comments"`
	ShowInNav      bool              `json:"show_in_nav"`
	SortOrder      int               `json:"sort_order"`
	SEOTitle       string            `json:"seo_title"`
	SEODescription string            `json:"seo_description"`
}

func (ctrl *PageController) GetPublicBySlug(c *gin.Context) {
	slug := c.Param("slug")
	page, err := ctrl.svc.GetPublishedPageBySlug(c.Request.Context(), slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "page not found"))
		return
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) GetNavPages(c *gin.Context) {
	pages, err := ctrl.svc.ListPublishedNavPages(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "failed to list nav pages"))
		return
	}
	if pages == nil {
		pages = []*domain.Page{}
	}
	c.JSON(http.StatusOK, gouno.NewSuccessResponse(pages))
}

func (ctrl *PageController) ListAdmin(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	page, pageSize = normalizedPagination(page, pageSize, 50)

	filter := domain.AdminPageFilter{
		Query:  c.Query("q"),
		Status: domain.PageStatus(c.Query("status")),
	}

	pages, total, err := ctrl.svc.ListAdminPages(c.Request.Context(), filter, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "failed to list pages"))
		return
	}
	if pages == nil {
		pages = []*domain.Page{}
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
		"list":      pages,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	}))
}

func (ctrl *PageController) GetAdmin(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid page id"))
		return
	}

	page, err := ctrl.svc.GetPage(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, "page not found"))
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) Create(c *gin.Context) {
	var req CreatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	template := req.Template
	if template == "" {
		template = string(domain.PageTemplateDefault)
	}
	status := req.Status
	if status == "" {
		status = domain.PageStatusDraft
	}

	page := &domain.Page{
		Title:          req.Title,
		Slug:           req.Slug,
		Content:        req.Content,
		Summary:        req.Summary,
		Template:       template,
		Status:         status,
		AllowComments:  req.AllowComments,
		ShowInNav:      req.ShowInNav,
		SortOrder:      req.SortOrder,
		SEOTitle:       req.SEOTitle,
		SEODescription: req.SEODescription,
	}

	if err := ctrl.svc.CreatePage(c.Request.Context(), page); err != nil {
		writePageServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid page id"))
		return
	}

	var req CreatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
		return
	}

	template := req.Template
	if template == "" {
		template = string(domain.PageTemplateDefault)
	}
	status := req.Status
	if status == "" {
		status = domain.PageStatusDraft
	}

	page := &domain.Page{
		ID:             id,
		Title:          req.Title,
		Slug:           req.Slug,
		Content:        req.Content,
		Summary:        req.Summary,
		Template:       template,
		Status:         status,
		AllowComments:  req.AllowComments,
		ShowInNav:      req.ShowInNav,
		SortOrder:      req.SortOrder,
		SEOTitle:       req.SEOTitle,
		SEODescription: req.SEODescription,
	}

	if err := ctrl.svc.UpdatePage(c.Request.Context(), page); err != nil {
		writePageServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, "invalid page id"))
		return
	}

	if err := ctrl.svc.DeletePage(c.Request.Context(), id); err != nil {
		writePageServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

func writePageServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrPageNotFound):
		c.JSON(http.StatusNotFound, gouno.NewErrorResponse(http.StatusNotFound, err.Error()))
	case errors.Is(err, service.ErrDuplicateSlug):
		c.JSON(http.StatusConflict, gouno.NewErrorResponse(http.StatusConflict, err.Error()))
	case errors.Is(err, service.ErrReservedSlug), errors.Is(err, service.ErrInvalidSlug), errors.Is(err, service.ErrPageTitleEmpty):
		c.JSON(http.StatusBadRequest, gouno.NewErrorResponse(http.StatusBadRequest, err.Error()))
	default:
		c.JSON(http.StatusInternalServerError, gouno.NewErrorResponse(http.StatusInternalServerError, "internal server error"))
	}
}
