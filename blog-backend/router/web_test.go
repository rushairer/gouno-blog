package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	communityrepository "github.com/rushairer/blog-backend/internal/community/repository"
	communityservice "github.com/rushairer/blog-backend/internal/community/service"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	auth "github.com/rushairer/gouno/auth"
)

func TestRegisterWebRouterDoesNotConflictOnPostWildcards(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("route registration panicked: %v", recovered)
		}
	}()
	postRepo := repository.NewPostRepository(nil)
	RegisterWebRouterWithOptions(engine, WebRouterOptions{
		AuthOptions:   middleware.AuthOptions{Issuer: "http://issuer.test", Audience: "blog-bff", ClientID: "blog-bff"},
		VisitorSecret: "test-secret", MediaDir: t.TempDir(), MediaStore: media.NewLocal(t.TempDir()),
		PostSvc:      service.NewPostService(postRepo),
		PageSvc:      service.NewPageService(repository.NewPageRepository(nil)),
		CategorySvc:  service.NewCategoryService(repository.NewCategoryRepository(nil)),
		CommunitySvc: communityservice.NewCommunityService(communityrepository.NewCommunityRepository(nil), postRepo),
		GrowthSvc:    service.NewGrowthService(repository.NewGrowthRepository(nil)),
		Verifier:     auth.NewVerifier("http://127.0.0.1:1/jwks"), AccessService: access.NewService(nil, access.Bootstrap{}),
	})

	foundUpdate := false
	foundLike := false
	foundRelated := false
	foundAnalytics := false
	foundMedia := false
	foundBlogSession := false
	foundHealth := false
	foundCommunityModeration := false
	communityModerationHandler := ""
	for _, route := range engine.Routes() {
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID" {
			foundUpdate = true
		}
		if route.Method == "PUT" && route.Path == "/api/posts/:slugOrID/like" {
			foundLike = true
		}
		if route.Method == "GET" && route.Path == "/api/posts/:slugOrID/related" {
			foundRelated = true
		}
		if route.Method == "GET" && route.Path == "/api/admin/analytics" {
			foundAnalytics = true
		}
		if route.Method == "GET" && route.Path == "/media/:filename" {
			foundMedia = true
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
	}
	if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration {
		t.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration)
	}
	if !strings.Contains(communityModerationHandler, "internal/community/controller") {
		t.Fatalf("comments/all must be owned by canonical Community controller, handler=%q", communityModerationHandler)
	}
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("health status=%d, want %d when database is unavailable", response.Code, http.StatusServiceUnavailable)
	}
}
