package controller_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	pagecontroller "github.com/rushairer/blog-backend/internal/page/controller"
	"github.com/rushairer/blog-backend/internal/page/domain"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
)

// No real DB or HTTP integration is faked here: this is the public transport
// contract for a controlled service result. The matching service+PostgreSQL
// behavior is separately tested in page_lookup_error_integration_test.go.
type pageFaultReadService struct {
	pagecontroller.PageServiceInterface
	page *domain.Page
	err error
}

func (s pageFaultReadService) GetPage(context.Context, int64) (*domain.Page, error) {
	return s.page, s.err
}
func (s pageFaultReadService) GetPageBySlug(context.Context, string) (*domain.Page, error) {
	return s.page, s.err
}

func TestPageReadHTTPDistinguishesConfirmedMissingFromPrivateDatabaseOutage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_POSTGRES_URL_AND_PAGE_CONTENT_NEVER_REFLECT"
	published := &domain.Page{ID: 37, Slug: "public-page", Status: domain.PageStatusPublished, Title: "Public"}
	draft := &domain.Page{ID: 38, Slug: "private-draft", Title: "PRIVATE_DRAFT_TITLE", Status: domain.PageStatusDraft, Content: marker}
	for _, tc := range []struct {
		name string
		page *domain.Page
		err error
		status int
		publicMessage string
	}{
		{"wrapped_not_found", nil, fmt.Errorf("%s: %w", marker, pageservice.ErrPageNotFound), http.StatusNotFound, "page not found"},
		{"raw_no_rows", nil, sql.ErrNoRows, http.StatusNotFound, "page not found"},
		{"nil_success_record", nil, nil, http.StatusNotFound, "page not found"},
		{"database_failure", nil, errors.New(marker), http.StatusInternalServerError, "internal server error"},
		{"cancelled_query", nil, fmt.Errorf("%s: %w", marker, context.Canceled), http.StatusInternalServerError, "internal server error"},
		{"published", published, nil, http.StatusOK, "Public"},
	} {
		for _, route := range []string{"public", "admin"} {
			t.Run(route+"_"+tc.name, func(t *testing.T) {
				svc := pageFaultReadService{page: tc.page, err: tc.err}
				ctrl := pagecontroller.NewPageController(svc)
				router := gin.New()
				if route == "public" {
					router.GET("/api/pages/:slug", ctrl.GetPublicBySlug)
				} else {
					router.GET("/api/admin/pages/:id", ctrl.GetAdmin)
				}
				path := "/api/pages/public-page"
				if route == "admin" {
					path = "/api/admin/pages/37"
				}
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
				if rec.Code != tc.status || !strings.Contains(rec.Body.String(), tc.publicMessage) ||
					strings.Contains(rec.Body.String(), marker) {
					t.Fatalf("Page %s failure was hidden or leaked: got=%d body=%s expected=%d",
						route, rec.Code, rec.Body.String(), tc.status)
				}
			})
		}
	}
	for _, tc := range []struct{
		name string
		svc pageFaultReadService
	}{
		{"anonymous_draft", pageFaultReadService{page: draft}},
		{"draft_and_error", pageFaultReadService{page: draft, err: errors.New(marker)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/api/pages/:slug", pagecontroller.NewPageController(tc.svc).GetPublicBySlug)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/pages/private-draft", nil))
			want := http.StatusNotFound
			if tc.svc.err != nil {
				want = http.StatusInternalServerError
			}
			if rec.Code != want || strings.Contains(rec.Body.String(), marker) ||
				strings.Contains(rec.Body.String(), draft.Title) {
				t.Fatalf("private draft or infrastructure details escaped: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
