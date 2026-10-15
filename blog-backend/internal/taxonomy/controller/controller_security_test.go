package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	taxonomydomain "github.com/rushairer/blog-backend/internal/taxonomy/domain"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
)

type taxonomyTransportErrorFixture struct {
	taxonomyservice.Service
	err error
}

func (f taxonomyTransportErrorFixture) CreateCategory(context.Context, *taxonomyservice.CategoryRequest) (*taxonomydomain.Category, error) {
	return nil, f.err
}
func (f taxonomyTransportErrorFixture) UpdateCategory(context.Context, int64, *taxonomyservice.CategoryRequest) error {
	return f.err
}
func (f taxonomyTransportErrorFixture) DeleteCategory(context.Context, int64) error {
	return f.err
}

func TestTaxonomyKnownSentinelsKeepLocalizedHTTPStatusWithoutWrappedCause(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_CATEGORY_DATABASE_OR_VALIDATION_CAUSE"
	for _, tc := range []struct {
		name string
		err error
		method string
		wantStatus int
		wantMessage string
	}{
		{"create_invalid_name", taxonomyservice.ErrCategoryNameRequired, "create",
			http.StatusBadRequest, taxonomyservice.ErrCategoryNameRequired.Error()},
		{"update_invalid_name", taxonomyservice.ErrCategoryNameRequired, "update",
			http.StatusBadRequest, taxonomyservice.ErrCategoryNameRequired.Error()},
		{"update_invalid_id", taxonomyservice.ErrInvalidCategoryID, "update",
			http.StatusBadRequest, taxonomyservice.ErrInvalidCategoryID.Error()},
		{"delete_invalid_id", taxonomyservice.ErrInvalidCategoryID, "delete",
			http.StatusBadRequest, taxonomyservice.ErrInvalidCategoryID.Error()},
		{"update_not_found", taxonomyservice.ErrCategoryNotFound, "update",
			http.StatusNotFound, "category not found"},
		{"create_slug_conflict", taxonomyservice.ErrCategorySlugInUse, "create",
			http.StatusConflict, "request conflict"},
		{"create_unknown_failure", errors.New(marker), "create",
			http.StatusInternalServerError, "internal server error"},
		{"delete_unknown_failure", errors.New(marker), "delete",
			http.StatusInternalServerError, "internal server error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			wrapped := fmt.Errorf("%s: %w", marker, tc.err)
			ctrl := New(taxonomyTransportErrorFixture{err: wrapped})
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "7"}}
			c.Request = httptest.NewRequest(http.MethodPut, "/api/admin/taxonomy/"+tc.method,
				strings.NewReader(`{"name":"safe","slug":"safe"}`))
			switch tc.method {
			case "create":
				ctrl.CreateCategory(c)
			case "update":
				ctrl.UpdateCategory(c)
			case "delete":
				ctrl.DeleteCategory(c)
			default:
				t.Fatalf("unexpected method %q", tc.method)
			}
			if rec.Code != tc.wantStatus ||
				!strings.Contains(rec.Body.String(), tc.wantMessage) ||
				strings.Contains(rec.Body.String(), marker) {
				t.Fatalf("taxonomy error was reflected or classified incorrectly: status=%d body=%s want=%d",
					rec.Code, rec.Body.String(), tc.wantStatus)
			}
		})
	}
}

func TestTaxonomyErrorFormatterNeverUsesUntrustedMessageContents(t *testing.T) {
	for _, known := range []error{taxonomyservice.ErrInvalidCategoryID, taxonomyservice.ErrCategoryNameRequired} {
		const marker = "SECRET_QUERY_DETAILS"
		wrapped := fmt.Errorf("%s: %w", marker, known)
		if got := taxonomyValidationMessage(wrapped); got != known.Error() ||
			strings.Contains(got, marker) {
			t.Fatalf("unsafe taxonomy error mapping: %s", got)
		}
	}
	if got := taxonomyValidationMessage(errors.New("secret diagnostics")); got != "invalid taxonomy request" {
		t.Fatalf("untrusted error message was returned: %s", got)
	}
}

func TestTaxonomyStrictInputValidationMessagesRemainStable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
		body string
		want string
	}{
		{"create_category", New(nil).CreateCategory,
			`{"name":{"sensitive_internal_column":"value"}}`, "name and a valid lowercase slug are required"},
		{"merge_tags", New(nil).MergeTags,
			`{"source":42,"target":"safe"}`, "distinct source and target tags are required"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/taxonomy/"+tc.name, strings.NewReader(tc.body))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest ||
				!strings.Contains(rec.Body.String(), tc.want) ||
				strings.Contains(rec.Body.String(), "sensitive_internal_column") ||
				strings.Contains(rec.Body.String(), "unmarshal") {
				t.Fatalf("taxonomy JSON error contract regressed: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
