package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	externaldomain "github.com/rushairer/blog-backend/internal/externalcapability/domain"
	externalservice "github.com/rushairer/blog-backend/internal/externalcapability/service"
	"github.com/rushairer/blog-backend/internal/tool"
)

type fakeCapabilityService struct {
	client          *externaldomain.Client
	created         *externaldomain.CreatedClient
	invoked         string
	authFailureErr  error
}

func (s *fakeCapabilityService) ExternalCatalog() []tool.CatalogItem {
	return []tool.CatalogItem{{Name: "content.list_published_posts"}}
}
func (s *fakeCapabilityService) CatalogForClient(*externaldomain.Client) []tool.CatalogItem {
	return []tool.CatalogItem{{Name: "content.list_published_posts"}}
}
func (s *fakeCapabilityService) CreateClient(context.Context, string, []string, bool, int, *time.Time, *int64) (*externaldomain.CreatedClient, error) {
	return s.created, nil
}
func (s *fakeCapabilityService) ListClients(context.Context) ([]externaldomain.Client, error) {
	return []externaldomain.Client{*s.client}, nil
}
func (s *fakeCapabilityService) ListAudits(context.Context, int64, int) ([]externaldomain.InvocationAudit, error) {
	return []externaldomain.InvocationAudit{{ID: 1, ClientID: s.client.ID, Capability: "content.list_published_posts", Result: "success"}}, nil
}
func (s *fakeCapabilityService) UpdateClient(context.Context, int64, string, []string, bool, int, *time.Time) (*externaldomain.Client, error) {
	return s.client, nil
}
func (s *fakeCapabilityService) RotateClientKey(context.Context, int64) (*externaldomain.CreatedClient, error) {
	return s.created, nil
}
func (s *fakeCapabilityService) RevokeClient(context.Context, int64) error {
	return nil
}
func (s *fakeCapabilityService) Authenticate(_ context.Context, key string) (*externaldomain.Client, error) {
	if key != "gouno_live_valid" {
		return nil, externalservice.ErrUnauthorized
	}
	return s.client, nil
}
func (s *fakeCapabilityService) AllowAuthenticationFailure(context.Context, string) error {
	return s.authFailureErr
}
func (s *fakeCapabilityService) Allow(context.Context, *externaldomain.Client) error {
	return nil
}
func (s *fakeCapabilityService) RecordRateLimited(context.Context, *externaldomain.Client, string, string, string) {}
func (s *fakeCapabilityService) Invoke(_ context.Context, _ *externaldomain.Client, name string, arguments json.RawMessage, _, _ string) (json.RawMessage, error) {
	s.invoked = name + ":" + string(arguments)
	return json.RawMessage(`{"ok":true}`), nil
}

func TestExternalBearerBoundaryAndInvocation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{
			ID: 1, Name: "client", Capabilities: []string{"content.list_published_posts"},
			Enabled: true, RateLimitPerMinute: 60,
		},
	}
	ctrl := New(service)
	router := gin.New()
	group := router.Group("/api/external/v1")
	group.Use(ctrl.RejectBrowserOrigin(), ctrl.Authenticate(), ctrl.RateLimit())
	group.GET("/capabilities", ctrl.Catalog)
	group.POST("/capabilities/:name/invoke", ctrl.Invoke)

	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(
		unauthorized,
		httptest.NewRequest(http.MethodGet, "/api/external/v1/capabilities", nil),
	)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/external/v1/capabilities/content.list_published_posts/invoke",
		strings.NewReader(`{"arguments":{"page":1}}`),
	)
	req.Header.Set("Authorization", "Bearer gouno_live_valid")
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("invoke status=%d body=%s", response.Code, response.Body.String())
	}
	if service.invoked != `content.list_published_posts:{"page":1}` {
		t.Fatalf("invoked = %q", service.invoked)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestExternalInvalidBearerIsFailureRateLimited(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Enabled: true, RateLimitPerMinute: 60},
		authFailureErr: externalservice.ErrRateLimited,
	}
	ctrl := New(service)
	router := gin.New()
	group := router.Group("/api/external/v1")
	group.Use(ctrl.RejectBrowserOrigin(), ctrl.Authenticate(), ctrl.RateLimit())
	group.GET("/capabilities", ctrl.Catalog)

	req := httptest.NewRequest(http.MethodGet, "/api/external/v1/capabilities", nil)
	req.Header.Set("Authorization", "Bearer gouno_live_invalid-key-material")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestExternalInvocationRejectsUnknownJSONFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Enabled: true, RateLimitPerMinute: 60},
	}
	ctrl := New(service)
	router := gin.New()
	group := router.Group("/api/external/v1")
	group.Use(ctrl.RejectBrowserOrigin(), ctrl.Authenticate(), ctrl.RateLimit())
	group.POST("/capabilities/:name/invoke", ctrl.Invoke)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/external/v1/capabilities/content.list_published_posts/invoke",
		strings.NewReader(`{"arguments":{},"unexpected":true}`),
	)
	req.Header.Set("Authorization", "Bearer gouno_live_valid")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if service.invoked != "" {
		t.Fatalf("unexpected invocation %q", service.invoked)
	}
}

func TestAdminCreateReturnsSecretWithNoStore(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Name: "client"},
		created: &externaldomain.CreatedClient{
			Client: externaldomain.Client{ID: 1, Name: "client"},
			APIKey: "gouno_live_secret-once",
		},
	}
	ctrl := New(service)
	router := gin.New()
	router.POST("/admin/clients", func(c *gin.Context) {
		c.Set("blog_principal_id", int64(9))
		ctrl.CreateClient(c)
	})

	req := httptest.NewRequest(
		http.MethodPost,
		"/admin/clients",
		strings.NewReader(`{"name":"SDK","capabilities":["content.list_published_posts"]}`),
	)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache control = %q", response.Header().Get("Cache-Control"))
	}
	if !strings.Contains(response.Body.String(), "gouno_live_secret-once") {
		t.Fatalf("secret missing from one-time create response: %s", response.Body.String())
	}
}


func TestExternalAPIRejectsBrowserOriginBeforeCredentialUse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Enabled: true, RateLimitPerMinute: 60},
	}
	ctrl := New(service)
	router := gin.New()
	group := router.Group("/api/external/v1")
	group.Use(ctrl.RejectBrowserOrigin(), ctrl.Authenticate(), ctrl.RateLimit())
	group.GET("/capabilities", ctrl.Catalog)

	req := httptest.NewRequest(http.MethodGet, "/api/external/v1/capabilities", nil)
	req.Header.Set("Origin", "https://blog.dev.local")
	req.Header.Set("Authorization", "Bearer gouno_live_valid")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAdminAuditListIsNoStore(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Enabled: true, RateLimitPerMinute: 60},
	}
	ctrl := New(service)
	router := gin.New()
	router.GET("/admin/audits", ctrl.ListAudits)

	response := httptest.NewRecorder()
	router.ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/admin/audits?client_id=1&limit=50", nil),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache control = %q", response.Header().Get("Cache-Control"))
	}
}


func TestAdminUpdateRequiresExplicitEnabledState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{ID: 1, Name: "client", Enabled: false, RateLimitPerMinute: 60},
	}
	ctrl := New(service)
	router := gin.New()
	router.PUT("/admin/clients/:id", ctrl.UpdateClient)

	req := httptest.NewRequest(
		http.MethodPut,
		"/admin/clients/1",
		strings.NewReader(`{"name":"client","capabilities":[],"rate_limit_per_minute":60}`),
	)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}
