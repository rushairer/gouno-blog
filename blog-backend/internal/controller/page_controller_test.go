package controller_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
)

type mockPageService struct {
	pages map[int64]*domain.Page
	slugs map[string]*domain.Page
}

func newMockPageService() *mockPageService {
	return &mockPageService{
		pages: make(map[int64]*domain.Page),
		slugs: make(map[string]*domain.Page),
	}
}

func (m *mockPageService) CreatePage(ctx context.Context, page *domain.Page) error {
	if page.Title == "" {
		return service.ErrPageTitleEmpty
	}
	if service.IsReservedSlug(page.Slug) {
		return service.ErrReservedSlug
	}
	page.ID = int64(len(m.pages) + 1)
	m.pages[page.ID] = page
	m.slugs[page.Slug] = page
	return nil
}

func (m *mockPageService) UpdatePage(ctx context.Context, page *domain.Page) error {
	if _, exists := m.pages[page.ID]; !exists {
		return service.ErrPageNotFound
	}
	m.pages[page.ID] = page
	m.slugs[page.Slug] = page
	return nil
}

func (m *mockPageService) DeletePage(ctx context.Context, id int64) error {
	p, exists := m.pages[id]
	if !exists {
		return service.ErrPageNotFound
	}
	delete(m.slugs, p.Slug)
	delete(m.pages, id)
	return nil
}

func (m *mockPageService) GetPage(ctx context.Context, id int64) (*domain.Page, error) {
	p, exists := m.pages[id]
	if !exists {
		return nil, service.ErrPageNotFound
	}
	return p, nil
}

func (m *mockPageService) GetPageBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	p, exists := m.slugs[slug]
	if !exists {
		return nil, service.ErrPageNotFound
	}
	return p, nil
}

func (m *mockPageService) GetPublishedPageBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	p, exists := m.slugs[slug]
	if !exists || p.Status != domain.PageStatusPublished {
		return nil, service.ErrPageNotFound
	}
	return p, nil
}

func (m *mockPageService) ListPublishedNavPages(ctx context.Context) ([]*domain.Page, error) {
	var list []*domain.Page
	for _, p := range m.pages {
		if p.Status == domain.PageStatusPublished && p.ShowInNav {
			list = append(list, p)
		}
	}
	return list, nil
}

func (m *mockPageService) ListPublishedPages(ctx context.Context) ([]*domain.Page, error) {
	var list []*domain.Page
	for _, p := range m.pages {
		if p.Status == domain.PageStatusPublished {
			list = append(list, p)
		}
	}
	return list, nil
}

func (m *mockPageService) ListAdminPages(ctx context.Context, filter domain.AdminPageFilter, page, pageSize int) ([]*domain.Page, int, error) {
	var list []*domain.Page
	for _, p := range m.pages {
		list = append(list, p)
	}
	return list, len(list), nil
}

func TestPageControllerEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mockSvc := newMockPageService()
	ctrl := controller.NewPageController(mockSvc)

	r := gin.New()
	r.GET("/api/pages/nav", ctrl.GetNavPages)
	r.GET("/api/pages/:slug", ctrl.GetPublicBySlug)
	r.GET("/api/admin/pages", ctrl.ListAdmin)
	r.POST("/api/admin/pages", ctrl.Create)
	r.PUT("/api/admin/pages/:id", ctrl.Update)
	r.DELETE("/api/admin/pages/:id", ctrl.Delete)

	// 1. Create page
	createPayload := controller.CreatePageRequest{
		Title:     "关于我",
		Slug:      "about",
		Content:   "# About content",
		Template:  "about",
		Status:    domain.PageStatusPublished,
		ShowInNav: true,
		SortOrder: 10,
	}
	body, _ := json.Marshal(createPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/pages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreatePage status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}

	// 2. Get public page by slug
	req = httptest.NewRequest(http.MethodGet, "/api/pages/about", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetPublicBySlug status = %d, want %d", w.Code, http.StatusOK)
	}

	// 3. Get nav pages
	req = httptest.NewRequest(http.MethodGet, "/api/pages/nav", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetNavPages status = %d, want %d", w.Code, http.StatusOK)
	}

	// 4. Try reserved slug
	reservedPayload := controller.CreatePageRequest{
		Title:  "Articles Page",
		Slug:   "articles",
		Status: domain.PageStatusPublished,
	}
	body, _ = json.Marshal(reservedPayload)
	req = httptest.NewRequest(http.MethodPost, "/api/admin/pages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Create reserved slug status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}
