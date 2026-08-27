package controller

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/domain"
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

func isAdminRequest(c *gin.Context) bool {
	if rawClaims, exists := c.Get("claims"); exists {
		if claims, ok := rawClaims.(jwt.MapClaims); ok {
			if roles, ok := claims["roles"].([]interface{}); ok {
				for _, r := range roles {
					if roleStr, ok := r.(string); ok && roleStr == "admin" {
						return true
					}
				}
			}
			if roleStr, ok := claims["role"].(string); ok && roleStr == "admin" {
				return true
			}
		}
	}
	return false
}

func (ctrl *PageController) GetPublicBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var page *domain.Page
	var err error

	if isAdminRequest(c) {
		page, err = ctrl.svc.GetPageBySlug(c.Request.Context(), slug)
	} else {
		page, err = ctrl.svc.GetPublishedPageBySlug(c.Request.Context(), slug)
	}

	if err != nil || page == nil {
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
	page, pageSize := ExtractPagination(c, 50)

	filter := domain.AdminPageFilter{
		Query:  c.Query("q"),
		Status: domain.PageStatus(c.Query("status")),
	}

	pages, total, err := ctrl.svc.ListAdminPages(c.Request.Context(), filter, page, pageSize)
	if err != nil {
		WriteDomainError(c, err)
		return
	}
	WritePaginated(c, pages, total, page, pageSize)
}

func (ctrl *PageController) GetAdmin(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
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
		WriteValidationError(c, err)
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
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) Update(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}

	var req CreatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteValidationError(c, err)
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
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(page))
}

func (ctrl *PageController) Delete(c *gin.Context) {
	id, ok := ParamPositiveID(c, "id")
	if !ok {
		return
	}

	if err := ctrl.svc.DeletePage(c.Request.Context(), id); err != nil {
		WriteDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gouno.NewSuccessResponse(nil))
}

