package router

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/media"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
	auth "github.com/rushairer/gouno/auth"
	"go.uber.org/zap"
)

type WebRouterOptions struct {
	DB                 *sql.DB
	AuthOptions        middleware.AuthOptions
	JWKSURL            string
	RedisDSN           string
	VisitorSecret      string
	MediaDir           string
	MediaStore         media.Store
	CORSAllowedOrigins []string
	PostSvc            *service.PostService
	PageSvc            *service.PageService
	CategorySvc        service.CategoryService
	CommunitySvc       *service.CommunityService
	GrowthSvc          *service.GrowthService
	AgentCtrl          *controller.AgentController
	Logger             *zap.Logger
}

func RegisterWebRouter(server *gin.Engine, db *sql.DB, authOptions middleware.AuthOptions, jwksURL, redisDSN, visitorSecret, mediaDir string, store media.Store, corsAllowedOrigins []string, agentCtrl *controller.AgentController) {
	RegisterWebRouterWithOptions(server, WebRouterOptions{
		DB:                 db,
		AuthOptions:        authOptions,
		JWKSURL:            jwksURL,
		RedisDSN:           redisDSN,
		VisitorSecret:      visitorSecret,
		MediaDir:           mediaDir,
		MediaStore:         store,
		CORSAllowedOrigins: corsAllowedOrigins,
		AgentCtrl:          agentCtrl,
	})
}

func RegisterWebRouterWithOptions(server *gin.Engine, opts WebRouterOptions) {
	if opts.Logger != nil {
		controller.SetResponseLogger(opts.Logger)
	}
	server.Use(corsMiddleware(opts.CORSAllowedOrigins))
	server.Use(requestBodyLimitMiddleware())
	server.Use(blogCSRFMiddleware(true))
	server.GET("/healthz", func(ctx *gin.Context) {
		if opts.DB == nil || opts.DB.PingContext(ctx.Request.Context()) != nil {
			ctx.Status(http.StatusServiceUnavailable)
			return
		}
		ctx.Status(http.StatusNoContent)
	})

	// Setup repository and service if not provided
	postSvc := opts.PostSvc
	if postSvc == nil {
		postSvc = service.NewPostService(repository.NewPostRepository(opts.DB))
	}
	ctrl := controller.NewPostController(postSvc)

	pageSvc := opts.PageSvc
	if pageSvc == nil {
		pageSvc = service.NewPageService(repository.NewPageRepository(opts.DB))
	}
	pageCtrl := controller.NewPageController(pageSvc)

	catSvc := opts.CategorySvc
	if catSvc == nil {
		catSvc = service.NewCategoryService(repository.NewCategoryRepository(opts.DB))
	}
	contentCtrl := controller.NewContentController(catSvc)

	feedCtrl := controller.NewFeedController(postSvc, pageSvc, catSvc)

	communitySvc := opts.CommunitySvc
	if communitySvc == nil {
		communitySvc = service.NewCommunityService(repository.NewCommunityRepository(opts.DB), repository.NewPostRepository(opts.DB))
	}
	var interactionLimiter service.RateLimiter
	if opts.RedisDSN != "" {
		if limiter, err := service.NewRedisRateLimiter(opts.RedisDSN); err == nil {
			interactionLimiter = limiter
		}
	}
	communityCtrl := controller.NewCommunityController(communitySvc, interactionLimiter, opts.VisitorSecret, opts.Logger)

	growthSvc := opts.GrowthSvc
	if growthSvc == nil {
		growthSvc = service.NewGrowthService(repository.NewGrowthRepository(opts.DB))
	}
	growthCtrl := controller.NewGrowthController(growthSvc, postSvc, communitySvc, opts.MediaStore, opts.Logger)

	if opts.MediaStore != nil {
		if _, local := opts.MediaStore.LocalPath(".probe"); local && os.MkdirAll(opts.MediaDir, 0o750) == nil {
			serveMedia := func(ctx *gin.Context) {
				filename := ctx.Param("filename")
				if filename == "" || filename != filepath.Base(filename) || filename == "." {
					ctx.Status(http.StatusNotFound)
					return
				}
				path, _ := opts.MediaStore.LocalPath(filename)
				ctx.File(path)
			}
			server.GET("/media/:filename", serveMedia)
			server.HEAD("/media/:filename", serveMedia)
		}
	}

	authOptions := opts.AuthOptions
	jwksURL := opts.JWKSURL
	agentCtrl := opts.AgentCtrl

	// RSS & Sitemap Routes
	server.GET("/feed.xml", feedCtrl.GetRSS)
	server.GET("/rss", feedCtrl.GetRSS)
	server.GET("/sitemap.xml", feedCtrl.GetSitemap)

	// Setup JWT verifier
	verifier := auth.NewVerifier(jwksURL)
	authOptions.RequiredRole = "admin"
	adminAuth := middleware.AuthMiddlewareWithOptions(verifier, authOptions)
	userAuthOptions := authOptions
	userAuthOptions.RequiredRole = ""
	userAuth := middleware.AuthMiddlewareWithOptions(verifier, userAuthOptions)
	optionalAuth := middleware.OptionalAuth(verifier, userAuthOptions)

	registerWebTestRouter(server)
	registerWebIndexRouter(server)

	// Swagger documentation routes
	swagger := server.Group("/swagger")
	{
		swagger.GET("/openapi.yaml", func(ctx *gin.Context) {
			ctx.File("./config/openapi.yaml")
		})
		swagger.GET("", func(ctx *gin.Context) {
			content, err := os.ReadFile("./config/swagger.html")
			if err != nil {
				ctx.String(http.StatusInternalServerError, "Error reading swagger.html")
				return
			}
			ctx.Data(http.StatusOK, "text/html; charset=utf-8", content)
		})
		swagger.GET("/", func(ctx *gin.Context) {
			content, err := os.ReadFile("./config/swagger.html")
			if err != nil {
				ctx.String(http.StatusInternalServerError, "Error reading swagger.html")
				return
			}
			ctx.Data(http.StatusOK, "text/html; charset=utf-8", content)
		})
	}

	// Public Blog Routes
	api := server.Group("/api")
	api.Use(optionalAuth)
	{
		if agentCtrl != nil {
			api.POST("/ai/webhooks/:event", agentCtrl.ReceiveWorkflowWebhook)
		}
		api.GET("/posts", ctrl.List)
		api.GET("/posts/:slugOrID", ctrl.Get)
		api.POST("/posts/:slugOrID/view", growthCtrl.TrackView)
		api.GET("/posts/:slugOrID/related", growthCtrl.RelatedPosts)
		api.GET("/posts/:slugOrID/community", communityCtrl.State)
		api.POST("/posts/:slugOrID/like", communityCtrl.Like)
		api.PUT("/posts/:slugOrID/like", communityCtrl.Like)
		api.DELETE("/posts/:slugOrID/like", communityCtrl.Unlike)
		api.GET("/tags", ctrl.ListTags)
		api.GET("/tags/summary", contentCtrl.ListPublishedTagSummaries)
		api.GET("/categories", contentCtrl.ListCategories)
		api.GET("/categories/:slug/posts", contentCtrl.ListCategoryPosts)
		api.GET("/pages/nav", pageCtrl.GetNavPages)
		api.GET("/pages/:slug", pageCtrl.GetPublicBySlug)
		api.GET("/site", contentCtrl.GetSiteSettings)

		api.GET("/posts/:slugOrID/comments", communityCtrl.GetComments)
		api.POST("/posts/:slugOrID/comments", communityCtrl.CreateComment)
		api.POST("/comments/:id/report", communityCtrl.ReportComment)

		me := api.Group("/me")
		me.Use(userAuth)
		{
			me.GET("/blog-session", func(c *gin.Context) {
				claims, _ := c.Get("claims")
				values, _ := claims.(jwt.MapClaims)
				c.JSON(http.StatusOK, gouno.NewSuccessResponse(gin.H{
					"sub": values["sub"], "roles": values["roles"], "scope": values["scope"],
				}))
			})
			me.GET("/notifications", communityCtrl.ListNotifications)
			me.PUT("/notifications/read-all", communityCtrl.ReadAllNotifications)
			me.PUT("/notifications/:id/read", communityCtrl.ReadNotification)
			me.DELETE("/notifications/:id", communityCtrl.DeleteNotification)
			me.POST("/notifications/batch-delete", communityCtrl.BatchDeleteNotifications)
			me.DELETE("/notifications", communityCtrl.ClearNotifications)
			me.DELETE("/notifications/clear-all", communityCtrl.ClearNotifications)
		}

		// Protected Blog Routes (Admin Only)
		admin := api.Group("")
		admin.Use(adminAuth)
		{
			admin.POST("/posts", ctrl.Create)
			admin.GET("/admin/posts", ctrl.ListAdmin)
			admin.GET("/admin/posts/:id", ctrl.GetAdmin)
			admin.POST("/admin/posts/batch", ctrl.Batch)
			admin.PUT("/posts/:slugOrID", ctrl.Update)
			admin.DELETE("/posts/:slugOrID", ctrl.Delete)
			admin.GET("/admin/pages", pageCtrl.ListAdmin)
			admin.GET("/admin/pages/:id", pageCtrl.GetAdmin)
			admin.POST("/admin/pages", pageCtrl.Create)
			admin.PUT("/admin/pages/:id", pageCtrl.Update)
			admin.DELETE("/admin/pages/:id", pageCtrl.Delete)
			admin.GET("/posts/:slugOrID/comments/all", ctrl.GetAllComments)
			admin.GET("/admin/comments", communityCtrl.ListAdminComments)
			admin.PUT("/admin/comments/:id", communityCtrl.ModerateComment)
			admin.DELETE("/comments/:id", communityCtrl.DeleteComment)
			admin.GET("/admin/posts/:id/versions", growthCtrl.ListVersions)
			admin.POST("/admin/posts/:id/versions/:versionID/restore", growthCtrl.RestoreVersion)
			admin.GET("/admin/media", growthCtrl.ListMedia)
			admin.POST("/admin/media", growthCtrl.UploadMedia)
			admin.PUT("/admin/media/:id", growthCtrl.UpdateMedia)
			admin.GET("/admin/media/:id/references", growthCtrl.MediaReferences)
			admin.DELETE("/admin/media/:id", growthCtrl.DeleteMedia)
			admin.GET("/admin/analytics", growthCtrl.Analytics)
			admin.GET("/admin/categories", contentCtrl.ListCategories)
			admin.POST("/admin/categories", contentCtrl.CreateCategory)
			admin.PUT("/admin/categories/:id", contentCtrl.UpdateCategory)
			admin.DELETE("/admin/categories/:id", contentCtrl.DeleteCategory)
			admin.GET("/admin/tags", contentCtrl.ListAdminTags)
			admin.PUT("/admin/tags/:name", contentCtrl.RenameTag)
			admin.POST("/admin/tags/merge", contentCtrl.MergeTags)
			admin.DELETE("/admin/tags/:name", contentCtrl.DeleteTag)
			admin.GET("/admin/settings", contentCtrl.GetSiteSettings)
			admin.PUT("/admin/settings", contentCtrl.UpdateSiteSettings)
			if agentCtrl != nil {
				admin.POST("/admin/ai-draft-assist", agentCtrl.DraftAssist)
				admin.POST("/admin/ai-generate-image", agentCtrl.GenerateImage)
				admin.POST("/admin/ai-workflows/draft", agentCtrl.DraftWorkflow)
				admin.POST("/admin/ai-workflows/agent-drafts", agentCtrl.DraftWorkflowAgents)
				admin.GET("/admin/provider-profiles", agentCtrl.ListProviders)
				admin.GET("/admin/provider-profiles/export", agentCtrl.ExportProviders)
				admin.POST("/admin/provider-profiles/import", agentCtrl.ImportProviders)
				admin.POST("/admin/provider-profiles", agentCtrl.CreateProvider)
				admin.PUT("/admin/provider-profiles/:id", agentCtrl.UpdateProvider)
				admin.DELETE("/admin/provider-profiles/:id", agentCtrl.DeleteProvider)
				admin.POST("/admin/provider-profiles/:id/test", agentCtrl.TestProvider)
				admin.POST("/admin/provider-profiles/:id/default/:purpose", agentCtrl.SetDefaultProvider)
				admin.GET("/admin/embedding-profiles", agentCtrl.ListEmbeddingProfiles)
				admin.POST("/admin/embedding-profiles", agentCtrl.CreateEmbeddingProfile)
				admin.PUT("/admin/embedding-profiles/:id", agentCtrl.UpdateEmbeddingProfile)
				admin.DELETE("/admin/embedding-profiles/:id", agentCtrl.DeleteEmbeddingProfile)
				admin.POST("/admin/embedding-profiles/:id/test", agentCtrl.TestEmbeddingProfile)
				admin.GET("/admin/ai-index/status", agentCtrl.IndexStatus)
				admin.POST("/admin/ai-index/rebuild", agentCtrl.RebuildIndex)
				admin.POST("/admin/ai-index/retry", agentCtrl.RetryIndex)
				admin.PUT("/admin/ai-index/evaluation-cases", agentCtrl.ReplaceIndexEvaluation)
				admin.POST("/admin/ai-index/evaluate", agentCtrl.EvaluateIndex)
				admin.GET("/admin/agents", agentCtrl.ListAgents)
				admin.POST("/admin/agents", agentCtrl.CreateAgent)
				admin.GET("/admin/agents/:id", agentCtrl.GetAgent)
				admin.PUT("/admin/agents/:id", agentCtrl.UpdateAgent)
				admin.DELETE("/admin/agents/:id", agentCtrl.DeleteAgent)
				admin.POST("/admin/agents/:id/enable", agentCtrl.EnableAgent)
				admin.POST("/admin/agents/:id/disable", agentCtrl.DisableAgent)
				admin.POST("/admin/agents/:id/run", agentCtrl.RunAgent)
				admin.GET("/admin/agent-skills", agentCtrl.ListSkills)
				admin.POST("/admin/agent-skills", agentCtrl.CreateSkill)
				admin.GET("/admin/agent-skills/:id", agentCtrl.GetSkill)
				admin.PUT("/admin/agent-skills/:id", agentCtrl.UpdateSkill)
				admin.DELETE("/admin/agent-skills/:id", agentCtrl.DeleteSkill)
				admin.GET("/admin/agent-skills/:id/versions", agentCtrl.ListSkillVersions)
				admin.POST("/admin/agent-skills/:id/copy", agentCtrl.CopySkill)
				admin.GET("/admin/agent-skills/:id/export", agentCtrl.ExportSkill)
				admin.POST("/admin/agent-skills/import", agentCtrl.ImportSkill)
				admin.GET("/admin/agent-tools", agentCtrl.ToolCatalog)
				admin.GET("/admin/agent-runs", agentCtrl.ListRuns)
				admin.GET("/admin/agent-runs/:id", agentCtrl.GetRun)
				admin.DELETE("/admin/agent-runs/:id", agentCtrl.DeleteRun)
				admin.GET("/admin/agent-approvals", agentCtrl.ListApprovals)
				admin.POST("/admin/agent-approvals/:id/approve", agentCtrl.Approve)
				admin.POST("/admin/agent-approvals/:id/reject", agentCtrl.Reject)
				admin.GET("/admin/ai-workflows", agentCtrl.ListWorkflows)
				admin.POST("/admin/ai-workflows", agentCtrl.CreateWorkflow)
				admin.GET("/admin/ai-workflows/:id", agentCtrl.GetWorkflow)
				admin.PUT("/admin/ai-workflows/:id", agentCtrl.UpdateWorkflow)
				admin.DELETE("/admin/ai-workflows/:id", agentCtrl.DeleteWorkflow)
				admin.GET("/admin/ai-workflows/:id/versions", agentCtrl.ListWorkflowVersions)
				admin.POST("/admin/ai-workflows/:id/rollback", agentCtrl.RollbackWorkflow)
				admin.POST("/admin/ai-workflows/:id/enable", agentCtrl.EnableWorkflow)
				admin.POST("/admin/ai-workflows/:id/disable", agentCtrl.DisableWorkflow)
				admin.POST("/admin/ai-workflows/:id/run", agentCtrl.RunWorkflow)
				admin.POST("/admin/ai-workflows/:id/dry-run", agentCtrl.DryRunWorkflow)
				admin.POST("/admin/ai-workflows/:id/preflight", agentCtrl.PreflightWorkflow)
				admin.GET("/admin/ai-workflow-runs", agentCtrl.ListWorkflowRuns)
				admin.DELETE("/admin/ai-workflow-runs/:id", agentCtrl.DeleteWorkflowRun)
				admin.POST("/admin/ai-workflow-runs/:id/cancel", agentCtrl.CancelWorkflowRun)
				admin.GET("/admin/ai-workflow-runs/:id/steps", agentCtrl.WorkflowRunSteps)
				admin.GET("/admin/ai-workflow-runs/:id/resources", agentCtrl.WorkflowRunResources)
				admin.GET("/admin/ai-workflow-runs/:id/interactions", agentCtrl.WorkflowRunInteractions)
				admin.GET("/admin/ai-workflow-runs/:id/media-candidates", agentCtrl.WorkflowRunMediaCandidates)
				admin.POST("/admin/ai-workflow-runs/:id/media-candidates/select", agentCtrl.SelectWorkflowImageTasks)
				admin.POST("/admin/ai-workflow-runs/:id/media-candidates/apply", agentCtrl.ApplyWorkflowImageTasks)
				admin.POST("/admin/ai-workflow-runs/:id/media-candidates/reject", agentCtrl.RejectWorkflowImageTasks)
				admin.GET("/admin/ai-workflow-runs/:id/events", agentCtrl.WorkflowRunEvents)
				admin.GET("/admin/ai-interactions/:id", agentCtrl.GetInteraction)
				admin.GET("/admin/ai-interactions", agentCtrl.ListPendingInteractions)
				admin.POST("/admin/ai-interactions/:id/resolve", agentCtrl.ResolveInteraction)
				admin.POST("/admin/ai-interactions/:id/cancel", agentCtrl.CancelInteraction)
				admin.POST("/admin/ai-workflow-runs/:id/retry", agentCtrl.RetryWorkflowRun)
				admin.POST("/admin/ai-workflow-events", agentCtrl.EmitWorkflowEvent)
				admin.GET("/admin/ai-connectors", agentCtrl.ListConnectorProfiles)
				admin.POST("/admin/ai-connectors", agentCtrl.SaveConnectorProfile)
				admin.POST("/admin/ai-connectors/:id/oauth/start", agentCtrl.BeginConnectorOAuth)
				admin.POST("/admin/ai-connectors/oauth/callback", agentCtrl.CompleteConnectorOAuth)
				admin.POST("/admin/ai-connectors/:id/search-console/summary", agentCtrl.SearchConsoleSummary)
				admin.GET("/admin/ai-connector-outbox", agentCtrl.ListConnectorOutbox)
				admin.POST("/admin/ai-connector-outbox", agentCtrl.QueueConnectorOutbox)
				admin.POST("/admin/ai-connector-outbox/:id/approve", agentCtrl.ApproveConnectorOutbox)
				admin.POST("/admin/ai-connector-outbox/:id/revoke", agentCtrl.RevokeConnectorOutbox)
				admin.POST("/admin/ai-connector-outbox/:id/deliver-mock", agentCtrl.DeliverConnectorOutboxMock)
				admin.POST("/admin/ai-connector-outbox/:id/retry", agentCtrl.RetryConnectorOutbox)
				admin.GET("/admin/ai-resources/:type", agentCtrl.ListAIResources)
				admin.GET("/admin/ai-workflow-metrics", agentCtrl.WorkflowMetrics)
				admin.GET("/admin/ai-suggestions", agentCtrl.ListSuggestions)
				admin.POST("/admin/ai-suggestions/refresh", agentCtrl.RefreshSuggestions)
				admin.POST("/admin/ai-suggestions/:id/ignore", agentCtrl.IgnoreSuggestion)
				admin.POST("/admin/ai-suggestions/:id/convert", agentCtrl.ConvertSuggestion)
				admin.GET("/admin/ai-editorial-tasks", agentCtrl.ListEditorialTasks)
				admin.POST("/admin/ai-editorial-tasks/:id/status", agentCtrl.UpdateEditorialTaskStatus)
				admin.GET("/admin/ai-candidates", agentCtrl.ListCandidateSets)
				admin.GET("/admin/ai-media-candidates", agentCtrl.ListMediaCandidates)
				admin.POST("/admin/ai-media-candidates/:id/review", agentCtrl.ReviewMediaCandidate)
				admin.POST("/admin/ai-media-candidates/:id/attach-media", agentCtrl.AttachMediaAsset)
				admin.POST("/admin/ai-media-candidates/:id/generate", agentCtrl.GenerateMediaCandidate)
				admin.POST("/admin/ai-image-tasks/:id/regenerate", agentCtrl.RegenerateImageTask)
				admin.POST("/admin/ai-image-tasks/:id/cancel", agentCtrl.CancelImageTask)
				admin.POST("/admin/ai-image-tasks/:id/reject", agentCtrl.RejectImageTask)
				admin.POST("/admin/ai-image-tasks/:id/select", agentCtrl.SelectImageTask)
				admin.POST("/admin/ai-image-tasks/:id/apply", agentCtrl.ApplyImageTask)
				admin.GET("/admin/ai-image-tasks/:id/preview", agentCtrl.PreviewImageTask)
				admin.GET("/admin/ai-image-tasks/:id/events", agentCtrl.ImageTaskEvents)
				admin.POST("/admin/ai-candidates/:id/select", agentCtrl.SelectCandidate)
				admin.POST("/admin/ai-feedback", agentCtrl.SaveFeedback)
				admin.GET("/admin/ai-outcome-metrics", agentCtrl.OutcomeMetrics)
			}
		}
	}
}

func registerWebTestRouter(server *gin.Engine) {
	testGroup := server.Group("/test")
	{
		testGroup.GET(
			"/alive",
			func(ctx *gin.Context) {
				ctx.JSON(http.StatusOK, gouno.NewSuccessResponse("pong"))
			},
		)
	}
}

func registerWebIndexRouter(server *gin.Engine) {
	server.GET("/", func(ctx *gin.Context) {
		ctx.String(http.StatusOK, "Hello from Blog Backend!")
	})
}
