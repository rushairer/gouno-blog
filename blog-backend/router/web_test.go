package router

import (
	"context"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	externalcontroller "github.com/rushairer/blog-backend/internal/externalcapability/controller"
	analyticsrepository "github.com/rushairer/blog-backend/internal/analytics/repository"
	analyticsservice "github.com/rushairer/blog-backend/internal/analytics/service"
	communityrepository "github.com/rushairer/blog-backend/internal/community/repository"
	communityservice "github.com/rushairer/blog-backend/internal/community/service"

	"github.com/rushairer/blog-backend/internal/media"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	pagerepository "github.com/rushairer/blog-backend/internal/page/repository"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
	postversionrepository "github.com/rushairer/blog-backend/internal/postversion/repository"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
	recommendationrepository "github.com/rushairer/blog-backend/internal/recommendation/repository"
	recommendationservice "github.com/rushairer/blog-backend/internal/recommendation/service"
	siterepository "github.com/rushairer/blog-backend/internal/site/repository"
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
	taxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
	"github.com/rushairer/blog-backend/middleware"
	auth "github.com/rushairer/gouno/auth"
	"go.yaml.in/yaml/v3"
)

type routerPostVersionRestorer struct{}

func (routerPostVersionRestorer) RestoreVersion(context.Context, int64, int64, int64) (*postdomain.Post, error) {
	return nil, nil
}

func TestRegisterWebRouterDoesNotConflictOnPostWildcards(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("route registration panicked: %v", recovered)
		}
	}()
	postRepo := postrepository.NewPostRepository(nil)
	RegisterWebRouterWithOptions(engine, WebRouterOptions{
		AuthOptions:   middleware.AuthOptions{Issuer: "http://issuer.test", Audience: "blog-bff", ClientID: "blog-bff"},
		VisitorSecret: "test-secret", MediaDir: t.TempDir(), MediaStore: media.NewLocal(t.TempDir()),
		PostSvc:           postservice.NewPostService(postRepo),
		PageSvc:           pageservice.NewPageService(pagerepository.NewPageRepository(nil)),
		MediaSvc:          mediaservice.New(mediarepository.New(nil)),
		TaxonomySvc:       taxonomyservice.New(taxonomyrepository.New(nil)),
		SiteSvc:           siteservice.New(siterepository.New(nil)),
		CommunitySvc:      communityservice.NewCommunityService(communityrepository.NewCommunityRepository(nil), postRepo),
		AnalyticsSvc:      analyticsservice.New(analyticsrepository.New(nil)),
		RecommendationSvc: recommendationservice.New(recommendationrepository.New(nil)),
		PostVersionSvc:    postversionservice.New(postversionrepository.New(nil), routerPostVersionRestorer{}),
		ExternalCtrl:      externalcontroller.New(nil), // Registration only; do not dispatch its service.
		Verifier:          auth.NewVerifier("http://127.0.0.1:1/jwks"), AccessService: access.NewService(nil, access.Bootstrap{}),
	})

	t.Run("ExternalCapabilityOpenAPIContract", func(t *testing.T) {
		assertExternalCapabilityOpenAPIContract(t, engine.Routes())
	})
	t.Run("ContentRouteOpenAPIContract", func(t *testing.T) {
		assertContentRouteOpenAPIContract(t, engine.Routes())
	})

	foundUpdate := false
	foundLike := false
	foundView := false
	viewHandler := ""
	foundRelated := false
	relatedHandler := ""
	foundAnalytics := false
	analyticsHandler := ""
	foundVersions := false
	versionsHandler := ""
	foundRestoreVersion := false
	restoreVersionHandler := ""
	foundMedia := false
	foundAdminMedia := false
	adminMediaHandler := ""
	foundBlogSession := false
	foundHealth := false
	foundCommunityModeration := false
	communityModerationHandler := ""
	foundTaxonomy := false
	taxonomyHandler := ""
	foundSite := false
	siteHandler := ""
	foundPage := false
	pageHandler := ""
	for _, route := range engine.Routes() {
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID" {
			foundUpdate = true
		}
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID/like" {
			foundLike = true
		}
		if route.Method == "POST" && route.Path == "/api/posts/:slugOrID/view" {
			foundView = true
			viewHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/posts/:slugOrID/related" {
			foundRelated = true
			relatedHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/admin/analytics" {
			foundAnalytics = true
			analyticsHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/admin/posts/:id/versions" {
			foundVersions = true
			versionsHandler = route.Handler
		}
		if route.Method == "POST" && route.Path == "/api/admin/posts/:id/versions/:versionID/restore" {
			foundRestoreVersion = true
			restoreVersionHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/media/:filename" {
			foundMedia = true
		}
		if route.Method == "GET" && route.Path == "/api/admin/media" {
			foundAdminMedia = true
			adminMediaHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/healthz" {
			foundHealth = true
		}
		if route.Method == "GET" && route.Path == "/api/me/blog-session" {
			foundBlogSession = true
		}
		if route.Method == "GET" && route.Path == "/api/posts/:slugOrID/comments/all" {
			foundCommunityModeration = true
			communityModerationHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/pages/nav" {
			foundPage = true
			pageHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/categories" {
			foundTaxonomy = true
			taxonomyHandler = route.Handler
		}
		if route.Method == "GET" && route.Path == "/api/site" {
			foundSite = true
			siteHandler = route.Handler
		}
	}
	if !foundUpdate || !foundLike || !foundView || !foundRelated || !foundAnalytics || !foundVersions || !foundRestoreVersion || !foundMedia || !foundAdminMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundPage || !foundTaxonomy || !foundSite {
		t.Fatalf("expected routes, update=%v like=%v view=%v related=%v analytics=%v versions=%v restoreVersion=%v media=%v adminMedia=%v health=%v blogSession=%v communityModeration=%v page=%v taxonomy=%v site=%v", foundUpdate, foundLike, foundView, foundRelated, foundAnalytics, foundVersions, foundRestoreVersion, foundMedia, foundAdminMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundPage, foundTaxonomy, foundSite)
	}
	if !strings.Contains(viewHandler, "internal/analytics/controller") {
		t.Fatalf("view tracking must be owned by canonical Analytics controller, handler=%q", viewHandler)
	}
	if !strings.Contains(analyticsHandler, "internal/analytics/controller") {
		t.Fatalf("analytics summary must be owned by canonical Analytics controller, handler=%q", analyticsHandler)
	}
	if !strings.Contains(relatedHandler, "internal/recommendation/controller") {
		t.Fatalf("related posts must be owned by canonical Recommendation controller, handler=%q", relatedHandler)
	}
	if !strings.Contains(versionsHandler, "internal/postversion/controller") {
		t.Fatalf("version listing must be owned by canonical Post Version controller, handler=%q", versionsHandler)
	}
	if !strings.Contains(restoreVersionHandler, "internal/postversion/controller") {
		t.Fatalf("version restore must be owned by canonical Post Version controller, handler=%q", restoreVersionHandler)
	}
	if !strings.Contains(adminMediaHandler, "internal/media/controller") {
		t.Fatalf("admin media must be owned by canonical Media controller, handler=%q", adminMediaHandler)
	}
	if !strings.Contains(communityModerationHandler, "internal/community/controller") {
		t.Fatalf("comments/all must be owned by canonical Community controller, handler=%q", communityModerationHandler)
	}
	if !strings.Contains(pageHandler, "internal/page/controller") {
		t.Fatalf("pages/nav must be owned by canonical Page controller, handler=%q", pageHandler)
	}
	if !strings.Contains(taxonomyHandler, "internal/taxonomy/controller") {
		t.Fatalf("categories must be owned by canonical Taxonomy controller, handler=%q", taxonomyHandler)
	}
	if !strings.Contains(siteHandler, "internal/site/controller") {
		t.Fatalf("site settings must be owned by canonical Site controller, handler=%q", siteHandler)
	}
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("health status=%d, want %d when database is unavailable", response.Code, http.StatusServiceUnavailable)
	}
}

// Compare actual Gin registrations, not a source regex, against the two
// external capability API families. Internal routes outside these families
// are not automatically promoted to supported external contracts.
func assertExternalCapabilityOpenAPIContract(t *testing.T, routes gin.RoutesInfo) {
	t.Helper()
	raw, err := os.ReadFile("../config/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]yaml.Node `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse OpenAPI: %v", err)
	}
	surface := func(path string) string {
		switch {
		case path == "/external/v1" || strings.HasPrefix(path, "/external/v1/"):
			return "ExternalAPIKey"
		case path == "/admin/external-api" || strings.HasPrefix(path, "/admin/external-api/"):
			return "BlogSessionCookie"
		default:
			return ""
		}
	}
	ginParam := regexp.MustCompile(`:[^/]+`)
	registered := make(map[string]string)
	for _, route := range routes {
		if !strings.HasPrefix(route.Path, "/api/") {
			continue
		}
		path := strings.TrimPrefix(route.Path, "/api")
		security := surface(path)
		if security == "" {
			continue
		}
		path = ginParam.ReplaceAllStringFunc(path, func(param string) string {
			return "{" + strings.TrimPrefix(param, ":") + "}"
		})
		registered[route.Method+" "+path] = security
	}
	if len(registered) < 9 {
		t.Fatalf("external capability registration incomplete: %v", registered)
	}
	documented := make(map[string]bool)
	for path, item := range spec.Paths {
		security := surface(path)
		if security == "" {
			continue
		}
		for method, node := range item {
			switch method {
			case "get", "post", "put", "patch", "delete", "head", "options", "trace":
			default:
				continue
			}
			key := strings.ToUpper(method) + " " + path
			documented[key] = true
			if registered[key] != security {
				t.Errorf("OpenAPI operation not registered: %s", key)
			}
			var operation struct {
				Security []map[string][]string `yaml:"security"`
			}
			if err := node.Decode(&operation); err != nil {
				t.Errorf("%s: invalid operation: %v", key, err)
				continue
			}
			if len(operation.Security) != 1 || len(operation.Security[0]) != 1 {
				t.Errorf("%s: expected exactly one %s security requirement", key, security)
				continue
			}
			if scopes, ok := operation.Security[0][security]; !ok || len(scopes) != 0 {
				t.Errorf("%s: wrong security requirement: %v", key, operation.Security)
			}
		}
	}
	for key := range registered {
		if !documented[key] {
			t.Errorf("registered external capability operation missing from OpenAPI: %s", key)
		}
	}
}

func assertContentRouteOpenAPIContract(t *testing.T, routes gin.RoutesInfo) {
	t.Helper()
	raw, err := os.ReadFile("../config/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]yaml.Node `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse OpenAPI: %v", err)
	}
	// OpenAPI forbids distinct templated paths that have the same hierarchy,
	// even when their parameter names differ (e.g. {id} versus {slugOrID}).
	templated := regexp.MustCompile(`\{[^{}]+\}`)
	shapes := make(map[string]string)
	for path := range spec.Paths {
		shape := templated.ReplaceAllString(path, "{}")
		if previous, ok := shapes[shape]; ok {
			t.Errorf("duplicate OpenAPI path hierarchy: %s and %s", previous, path)
		}
		shapes[shape] = path
	}

	ginParam := regexp.MustCompile(`:[^/]+`)
	registered := make(map[string]bool)
	for _, route := range routes {
		if !strings.HasPrefix(route.Path, "/api/") {
			continue
		}
		path := ginParam.ReplaceAllStringFunc(strings.TrimPrefix(route.Path, "/api"), func(param string) string {
			return "{" + strings.TrimPrefix(param, ":") + "}"
		})
		registered[route.Method+" "+path] = true
	}
	for _, op := range []struct {
		method string
		path   string
	}{
		{"get", "/tags/summary"},
		{"get", "/pages/nav"},
		{"get", "/pages/{slug}"},
		{"get", "/posts/{slugOrID}"},
		{"put", "/posts/{slugOrID}"},
		{"delete", "/posts/{slugOrID}"},
	} {
		key := strings.ToUpper(op.method) + " " + op.path
		if !registered[key] {
			t.Errorf("content operation not registered: %s", key)
		}
		node, ok := spec.Paths[op.path][op.method]
		if !ok || node.Kind != yaml.MappingNode {
			t.Errorf("content operation missing or invalid in OpenAPI: %s", key)
		}
	}
}
