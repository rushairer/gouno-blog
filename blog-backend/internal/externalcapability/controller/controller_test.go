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
	client  *externaldomain.Client
	created *externaldomain.CreatedClient
	invoked string
}

func (s *fakeCapabilityService) ExternalCatalog() []tool.CatalogItem {
	return []tool.CatalogItem{{Name: "content.list_posts"}}
}
func (s *fakeCapabilityService) CatalogForClient(*externaldomain.Client) []tool.CatalogItem {
	return []tool.CatalogItem{{Name: "content.list_posts"}}
}
func (s *fakeCapabilityService) CreateClient(context.Context, string, []string, int, *time.Time, *int64) (*externaldomain.CreatedClient, error) {
	return s.created, nil
}
func (s *fakeCapabilityService) ListClients(context.Context) ([]externaldomain.Client, error) {
	return []externaldomain.Client{*s.client}, nil
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
func (s *fakeCapabilityService) Allow(context.Context, *externaldomain.Client) error {
	return nil
}
func (s *fakeCapabilityService) Invoke(_ context.Context, _ *externaldomain.Client, name string, arguments json.RawMessage, _, _ string) (json.RawMessage, error) {
	s.invoked = name + ":" + string(arguments)
	return json.RawMessage(`{"ok":true}`), nil
}

func TestExternalBearerBoundaryAndInvocation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeCapabilityService{
		client: &externaldomain.Client{
			ID: 1, Name: "client", Capabilities: []string{"content.list_posts"},
			Enabled: true, RateLimitPerMinute: 60,
		},
	}
	ctrl := New(service)
	router := gin.New()
	group := router.Group("/api/external/v1")
	group.Use(ctrl.Authenticate(), ctrl.RateLimit())
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
		"/api/external/v1/capabilities/content.list_posts/invoke",
		strings.NewReader(`{"arguments":{"page":1}}`),
	)
	req.Header.Set("Authorization", "Bearer gouno_live_valid")
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("invoke status=%d body=%s", response.Code, response.Body.String())
	}
	if service.invoked != `content.list_posts:{"page":1}` {
		t.Fatalf("invoked = %q", service.invoked)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache control = %q", response.Header().Get("Cache-Control"))
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
	group.Use(ctrl.Authenticate(), ctrl.RateLimit())
	group.POST("/capabilities/:name/invoke", ctrl.Invoke)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/external/v1/capabilities/content.list_posts/invoke",
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
		strings.NewReader(`{"name":"SDK","capabilities":["content.list_posts"]}`),
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
