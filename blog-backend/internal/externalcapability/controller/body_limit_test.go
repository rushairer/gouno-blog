package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/externalcapability/domain"
	"github.com/rushairer/blog-backend/middleware"
)

func TestExternalCapabilityBodyOverflowNeverInvokesTools(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, body string
		unknownLength bool
		withGlobalMiddleware bool
		want int
	}{
		{"declared-overflow", `{"arguments":{}}` + strings.Repeat(" ", middleware.MaxAPIJSONBody), false, true, http.StatusRequestEntityTooLarge},
		{"unknown-length-trailing-whitespace", `{"arguments":{}}` + strings.Repeat(" ", middleware.MaxAPIJSONBody), true, true, http.StatusRequestEntityTooLarge},
		{"unknown-length-json-token", `{"arguments":{"padding":"` + strings.Repeat("x", middleware.MaxAPIJSONBody) + `"}}`, true, true, http.StatusRequestEntityTooLarge},
		{"isolated-handler-overflow", `{"arguments":{}}` + strings.Repeat(" ", middleware.MaxAPIJSONBody), true, false, http.StatusRequestEntityTooLarge},
		{"malformed-remains-fixed-400", `{"arguments":"private-invalid-json`, true, false, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCapabilityService{
				client: &domain.Client{ID: 1, Enabled: true, RateLimitPerMinute: 60},
			}
			ctrl := New(service)
			router := gin.New()
			if tc.withGlobalMiddleware {
				router.Use(middleware.RequestBodyLimitMiddleware())
			}
			group := router.Group("/api/external/v1")
			group.Use(ctrl.RejectBrowserOrigin(), ctrl.Authenticate(), ctrl.RateLimit())
			group.POST("/capabilities/:name/invoke", ctrl.Invoke)
			req := httptest.NewRequest(http.MethodPost, "/api/external/v1/capabilities/content.list_published_posts/invoke", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer gouno_live_valid")
			req.Header.Set("Content-Type", "application/json")
			if tc.unknownLength {
				req.ContentLength = -1
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != tc.want {
				t.Fatalf("status=%d, want %d: %s", response.Code, tc.want, response.Body.String())
			}
			if service.invoked != "" {
				t.Fatalf("invalid body invoked Tool service: %q", service.invoked)
			}
			if tc.want == http.StatusBadRequest {
				if !strings.Contains(response.Body.String(), "invalid external capability request") || strings.Contains(response.Body.String(), "private-invalid-json") {
					t.Fatalf("unsafe/changed 400 contract: %s", response.Body.String())
				}
			}
		})
	}
}

func TestExternalAdminClientCreateOverflowNeverReturnsKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &domain.Client{ID: 1, Name: "client"},
		created: &domain.CreatedClient{
			Client: domain.Client{ID: 1, Name: "client"},
			APIKey: "gouno_live_private-key",
		},
	}
	router := gin.New()
	ctrl := New(service)
	router.POST("/admin/clients", func(c *gin.Context) {
		c.Set("blog_principal_id", int64(9))
		ctrl.CreateClient(c)
	})
	req := httptest.NewRequest(http.MethodPost, "/admin/clients", strings.NewReader(`{"name":"SDK"}`+strings.Repeat(" ", middleware.MaxAPIJSONBody)))
	req.ContentLength = -1
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d, body=%s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "gouno_live_private-key") {
		t.Fatal("oversized request response disclosed API key")
	}
}
