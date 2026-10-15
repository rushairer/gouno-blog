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
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
)

type siteSettingsErrorFixture struct {
	siteservice.Service
	err error
}

func (f siteSettingsErrorFixture) UpdateSiteSettings(context.Context, map[string]string) (map[string]string, error) {
	return nil, f.err
}

func TestSiteSettingsKnownValidationRetainsLocalizedHTTP400WithoutWrappedCause(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "UNEXPECTED_INTERNAL_DIAGNOSTIC_SENTINEL"
	for _, known := range []error{
		siteservice.ErrSettingValueTooLong, siteservice.ErrSiteTitleEmpty,
		siteservice.ErrInvalidRSSURL, siteservice.ErrInvalidGithubURL,
		siteservice.ErrInvalidFaviconURL,
	} {
		t.Run(known.Error(), func(t *testing.T) {
			ctrl := New(siteSettingsErrorFixture{err: fmt.Errorf("%s: %w", marker, known)})
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPut, "/api/admin/site/settings", strings.NewReader(`{"site_title":"valid"}`))
			ctrl.UpdateSiteSettings(c)
			if rec.Code != http.StatusBadRequest ||
				!strings.Contains(rec.Body.String(), known.Error()) ||
				strings.Contains(rec.Body.String(), marker) {
				t.Fatalf("wrapped site error leaked or lost localized status: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestSiteSettingsUnknownErrorIsRedactedHTTP500(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "UNEXPECTED_INTERNAL_DIAGNOSTIC_SENTINEL"
	ctrl := New(siteSettingsErrorFixture{err: errors.New(marker)})
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPut, "/api/admin/site/settings", strings.NewReader(`{"site_title":"valid"}`))
	ctrl.UpdateSiteSettings(c)
	if rec.Code != http.StatusInternalServerError ||
		!strings.Contains(rec.Body.String(), "internal server error") ||
		strings.Contains(rec.Body.String(), marker) {
		t.Fatalf("site persistence failure was reflected or misclassified: %d %s", rec.Code, rec.Body.String())
	}
}

func TestSiteSettingsMalformedJSONStillUsesExistingSafe400Contract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := New(siteSettingsErrorFixture{})
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPut, "/api/admin/site/settings",
		strings.NewReader(`{"site_title":{"private_field":"should-not-leak"}}`))
	ctrl.UpdateSiteSettings(c)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "invalid settings payload") ||
		strings.Contains(rec.Body.String(), "private_field") {
		t.Fatalf("site decoder detail reflected: %d %s", rec.Code, rec.Body.String())
	}
}
