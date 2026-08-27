package router

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
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
	BootstrapOwner     access.Bootstrap
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
	userAuthOptions := authOptions
	userAuthOptions.RequiredRole = ""
	userAuth := middleware.AuthMiddlewareWithOptions(verifier, userAuthOptions)
	optionalAuth := middleware.OptionalAuth(verifier, userAuthOptions)
	accessService := access.NewService(opts.DB, opts.BootstrapOwner)
	accessAuth := middleware.BlogAccess(accessService)
	optionalAccessAuth := middleware.OptionalBlogAccess(accessService)
	accessCtrl := controller.NewAccessController(accessService)

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
	api.Use(optionalAuth, optionalAccessAuth)
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
		me.Use(userAuth, accessAuth)
		{
			me.GET("/blog-session", accessCtrl.Session)
			me.GET("/notifications", communityCtrl.ListNotifications)
			me.PUT("/notifications/read-all", communityCtrl.ReadAllNotifications)
			me.PUT("/notifications/:id/read", communityCtrl.ReadNotification)
			me.DELETE("/notifications/:id", communityCtrl.DeleteNotification)
			me.POST("/notifications/batch-delete", communityCtrl.BatchDeleteNotifications)
			me.DELETE("/notifications", communityCtrl.ClearNotifications)
			me.DELETE("/notifications/clear-all", communityCtrl.ClearNotifications)
		}

		members := api.Group("/admin/members")
		members.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageMembers))
		{
			members.GET("", accessCtrl.ListMembers)
			members.PUT("/:principalID", accessCtrl.UpdateMember)
			members.POST("/:principalID/transfer-owner", accessCtrl.TransferOwner)
			members.GET("/audits", accessCtrl.ListAudits)
		}

		// Community Moderation (Moderators, Editors, Admins, Owners)
		moderate := api.Group("")
		moderate.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionModerate))
		{
			moderate.GET("/posts/:slugOrID/comments/all", ctrl.GetAllComments)
			moderate.GET("/admin/comments", communityCtrl.ListAdminComments)
			moderate.PUT("/admin/comments/:id", communityCtrl.ModerateComment)
			moderate.DELETE("/comments/:id", communityCtrl.DeleteComment)
		}

		// Content Authoring (Authors, Editors, Admins, Owners)
		author := api.Group("")
		author.Use(userAuth, accessAuth, middleware.RequireAnyBlogPermission(accessService, access.PermissionAuthorContent, access.PermissionManageContent))
		{
			author.POST("/posts", ctrl.Create)
			author.GET("/admin/posts", ctrl.ListAdmin)
			author.GET("/admin/posts/:id", ctrl.GetAdmin)
			author.PUT("/posts/:slugOrID", ctrl.Update)
			author.GET("/admin/posts/:id/versions", growthCtrl.ListVersions)
			author.POST("/admin/posts/:id/versions/:versionID/restore", growthCtrl.RestoreVersion)
			author.GET("/admin/categories", contentCtrl.ListCategories)
			author.GET("/admin/tags", contentCtrl.ListAdminTags)
			author.GET("/admin/media", growthCtrl.ListMedia)
			author.POST("/admin/media", growthCtrl.UploadMedia)
			author.PUT("/admin/media/:id", growthCtrl.UpdateMedia)
			author.GET("/admin/media/:id/references", growthCtrl.MediaReferences)
			author.DELETE("/admin/media/:id", growthCtrl.DeleteMedia)
			if agentCtrl != nil {
				author.POST("/admin/ai-draft-assist", agentCtrl.DraftAssist)
				author.POST("/admin/ai-generate-image", agentCtrl.GenerateImage)
			}
		}

		// Content Management (Editors, Admins, Owners)
		contentManage := api.Group("")
		contentManage.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageContent))
		{
			contentManage.POST("/admin/posts/batch", ctrl.Batch)
			contentManage.DELETE("/posts/:slugOrID", ctrl.Delete)
			contentManage.GET("/admin/pages", pageCtrl.ListAdmin)
			contentManage.GET("/admin/pages/:id", pageCtrl.GetAdmin)
			contentManage.POST("/admin/pages", pageCtrl.Create)
			contentManage.PUT("/admin/pages/:id", pageCtrl.Update)
			contentManage.DELETE("/admin/pages/:id", pageCtrl.Delete)
			contentManage.POST("/admin/categories", contentCtrl.CreateCategory)
			contentManage.PUT("/admin/categories/:id", contentCtrl.UpdateCategory)
			contentManage.DELETE("/admin/categories/:id", contentCtrl.DeleteCategory)
			contentManage.PUT("/admin/tags/:name", contentCtrl.RenameTag)
			contentManage.POST("/admin/tags/merge", contentCtrl.MergeTags)
			contentManage.DELETE("/admin/tags/:name", contentCtrl.DeleteTag)
		}

		// Analytics / General Overview (Any active Blog staff role)
		staffOverview := api.Group("")
		staffOverview.Use(userAuth, accessAuth, middleware.RequireActiveBlogMembership())
		{
			staffOverview.GET("/admin/analytics", growthCtrl.Analytics)
		}

		// Site Settings (Admins, Owners)
		siteSettings := api.Group("")
		siteSettings.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageSite))
		{
			siteSettings.GET("/admin/settings", contentCtrl.GetSiteSettings)
			siteSettings.PUT("/admin/settings", contentCtrl.UpdateSiteSettings)
		}

		// AI Operations & Automated Agents (AI Managers, Admins, Owners)
		aiOps := api.Group("")
		aiOps.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageAI))
		{
			if agentCtrl != nil {
				aiOps.POST("/admin/ai-workflows/draft", agentCtrl.DraftWorkflow)
				aiOps.POST("/admin/ai-workflows/agent-drafts", agentCtrl.DraftWorkflowAgents)
				aiOps.GET("/admin/provider-profiles", agentCtrl.ListProviders)
				aiOps.GET("/admin/provider-profiles/export", agentCtrl.ExportProviders)
				aiOps.POST("/admin/provider-profiles/import", agentCtrl.ImportProviders)
				aiOps.POST("/admin/provider-profiles", agentCtrl.CreateProvider)
				aiOps.PUT("/admin/provider-profiles/:id", agentCtrl.UpdateProvider)
				aiOps.DELETE("/admin/provider-profiles/:id", agentCtrl.DeleteProvider)
				aiOps.POST("/admin/provider-profiles/:id/test", agentCtrl.TestProvider)
				aiOps.POST("/admin/provider-profiles/:id/default/:purpose", agentCtrl.SetDefaultProvider)
				aiOps.GET("/admin/embedding-profiles", agentCtrl.ListEmbeddingProfiles)
				aiOps.POST("/admin/embedding-profiles", agentCtrl.CreateEmbeddingProfile)
				aiOps.PUT("/admin/embedding-profiles/:id", agentCtrl.UpdateEmbeddingProfile)
				aiOps.DELETE("/admin/embedding-profiles/:id", agentCtrl.DeleteEmbeddingProfile)
				aiOps.POST("/admin/embedding-profiles/:id/test", agentCtrl.TestEmbeddingProfile)
				aiOps.GET("/admin/ai-index/status", agentCtrl.IndexStatus)
				aiOps.POST("/admin/ai-index/rebuild", agentCtrl.RebuildIndex)
				aiOps.POST("/admin/ai-index/retry", agentCtrl.RetryIndex)
				aiOps.PUT("/admin/ai-index/evaluation-cases", agentCtrl.ReplaceIndexEvaluation)
				aiOps.POST("/admin/ai-index/evaluate", agentCtrl.EvaluateIndex)
				aiOps.GET("/admin/agents", agentCtrl.ListAgents)
				aiOps.POST("/admin/agents", agentCtrl.CreateAgent)
				aiOps.GET("/admin/agents/:id", agentCtrl.GetAgent)
				aiOps.PUT("/admin/agents/:id", agentCtrl.UpdateAgent)
				aiOps.DELETE("/admin/agents/:id", agentCtrl.DeleteAgent)
				aiOps.POST("/admin/agents/:id/enable", agentCtrl.EnableAgent)
				aiOps.POST("/admin/agents/:id/disable", agentCtrl.DisableAgent)
				aiOps.POST("/admin/agents/:id/run", agentCtrl.RunAgent)
				aiOps.GET("/admin/agent-skills", agentCtrl.ListSkills)
				aiOps.POST("/admin/agent-skills", agentCtrl.CreateSkill)
				aiOps.GET("/admin/agent-skills/:id", agentCtrl.GetSkill)
				aiOps.PUT("/admin/agent-skills/:id", agentCtrl.UpdateSkill)
				aiOps.DELETE("/admin/agent-skills/:id", agentCtrl.DeleteSkill)
				aiOps.GET("/admin/agent-skills/:id/versions", agentCtrl.ListSkillVersions)
				aiOps.POST("/admin/agent-skills/:id/copy", agentCtrl.CopySkill)
				aiOps.GET("/admin/agent-skills/:id/export", agentCtrl.ExportSkill)
				aiOps.POST("/admin/agent-skills/import", agentCtrl.ImportSkill)
				aiOps.GET("/admin/agent-tools", agentCtrl.ToolCatalog)
				aiOps.GET("/admin/agent-runs", agentCtrl.ListRuns)
				aiOps.GET("/admin/agent-runs/:id", agentCtrl.GetRun)
				aiOps.DELETE("/admin/agent-runs/:id", agentCtrl.DeleteRun)
				aiOps.GET("/admin/agent-approvals", agentCtrl.ListApprovals)
				aiOps.POST("/admin/agent-approvals/:id/approve", agentCtrl.Approve)
				aiOps.POST("/admin/agent-approvals/:id/reject", agentCtrl.Reject)
				aiOps.GET("/admin/ai-workflows", agentCtrl.ListWorkflows)
				aiOps.POST("/admin/ai-workflows", agentCtrl.CreateWorkflow)
				aiOps.GET("/admin/ai-workflows/:id", agentCtrl.GetWorkflow)
				aiOps.PUT("/admin/ai-workflows/:id", agentCtrl.UpdateWorkflow)
				aiOps.DELETE("/admin/ai-workflows/:id", agentCtrl.DeleteWorkflow)
				aiOps.GET("/admin/ai-workflows/:id/versions", agentCtrl.ListWorkflowVersions)
				aiOps.POST("/admin/ai-workflows/:id/rollback", agentCtrl.RollbackWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/enable", agentCtrl.EnableWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/disable", agentCtrl.DisableWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/run", agentCtrl.RunWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/dry-run", agentCtrl.DryRunWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/preflight", agentCtrl.PreflightWorkflow)
				aiOps.GET("/admin/ai-workflow-runs", agentCtrl.ListWorkflowRuns)
				aiOps.DELETE("/admin/ai-workflow-runs/:id", agentCtrl.DeleteWorkflowRun)
				aiOps.POST("/admin/ai-workflow-runs/:id/cancel", agentCtrl.CancelWorkflowRun)
				aiOps.GET("/admin/ai-workflow-runs/:id/steps", agentCtrl.WorkflowRunSteps)
				aiOps.GET("/admin/ai-workflow-runs/:id/resources", agentCtrl.WorkflowRunResources)
				aiOps.GET("/admin/ai-workflow-runs/:id/interactions", agentCtrl.WorkflowRunInteractions)
				aiOps.GET("/admin/ai-workflow-runs/:id/media-candidates", agentCtrl.WorkflowRunMediaCandidates)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/select", agentCtrl.SelectWorkflowImageTasks)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/apply", agentCtrl.ApplyWorkflowImageTasks)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/reject", agentCtrl.RejectWorkflowImageTasks)
				aiOps.GET("/admin/ai-workflow-runs/:id/events", agentCtrl.WorkflowRunEvents)
				aiOps.GET("/admin/ai-interactions/:id", agentCtrl.GetInteraction)
				aiOps.GET("/admin/ai-interactions", agentCtrl.ListPendingInteractions)
				aiOps.POST("/admin/ai-interactions/:id/resolve", agentCtrl.ResolveInteraction)
				aiOps.POST("/admin/ai-interactions/:id/cancel", agentCtrl.CancelInteraction)
				aiOps.POST("/admin/ai-workflow-runs/:id/retry", agentCtrl.RetryWorkflowRun)
				aiOps.POST("/admin/ai-workflow-events", agentCtrl.EmitWorkflowEvent)
				aiOps.GET("/admin/ai-connectors", agentCtrl.ListConnectorProfiles)
				aiOps.POST("/admin/ai-connectors", agentCtrl.SaveConnectorProfile)
				aiOps.POST("/admin/ai-connectors/:id/oauth/start", agentCtrl.BeginConnectorOAuth)
				aiOps.POST("/admin/ai-connectors/oauth/callback", agentCtrl.CompleteConnectorOAuth)
				aiOps.POST("/admin/ai-connectors/:id/search-console/summary", agentCtrl.SearchConsoleSummary)
				aiOps.GET("/admin/ai-connector-outbox", agentCtrl.ListConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox", agentCtrl.QueueConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/approve", agentCtrl.ApproveConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/revoke", agentCtrl.RevokeConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/deliver-mock", agentCtrl.DeliverConnectorOutboxMock)
				aiOps.POST("/admin/ai-connector-outbox/:id/retry", agentCtrl.RetryConnectorOutbox)
				aiOps.GET("/admin/ai-resources/:type", agentCtrl.ListAIResources)
				aiOps.GET("/admin/ai-workflow-metrics", agentCtrl.WorkflowMetrics)
				aiOps.GET("/admin/ai-suggestions", agentCtrl.ListSuggestions)
				aiOps.POST("/admin/ai-suggestions/refresh", agentCtrl.RefreshSuggestions)
				aiOps.POST("/admin/ai-suggestions/:id/ignore", agentCtrl.IgnoreSuggestion)
				aiOps.POST("/admin/ai-suggestions/:id/convert", agentCtrl.ConvertSuggestion)
				aiOps.GET("/admin/ai-editorial-tasks", agentCtrl.ListEditorialTasks)
				aiOps.POST("/admin/ai-editorial-tasks/:id/status", agentCtrl.UpdateEditorialTaskStatus)
				aiOps.GET("/admin/ai-candidates", agentCtrl.ListCandidateSets)
				aiOps.GET("/admin/ai-media-candidates", agentCtrl.ListMediaCandidates)
				aiOps.POST("/admin/ai-media-candidates/:id/review", agentCtrl.ReviewMediaCandidate)
				aiOps.POST("/admin/ai-media-candidates/:id/attach-media", agentCtrl.AttachMediaAsset)
				aiOps.POST("/admin/ai-media-candidates/:id/generate", agentCtrl.GenerateMediaCandidate)
				aiOps.POST("/admin/ai-image-tasks/:id/regenerate", agentCtrl.RegenerateImageTask)
				aiOps.POST("/admin/ai-image-tasks/:id/cancel", agentCtrl.CancelImageTask)
				aiOps.POST("/admin/ai-image-tasks/:id/reject", agentCtrl.RejectImageTask)
				aiOps.POST("/admin/ai-image-tasks/:id/select", agentCtrl.SelectImageTask)
				aiOps.POST("/admin/ai-image-tasks/:id/apply", agentCtrl.ApplyImageTask)
				aiOps.GET("/admin/ai-image-tasks/:id/preview", agentCtrl.PreviewImageTask)
				aiOps.GET("/admin/ai-image-tasks/:id/events", agentCtrl.ImageTaskEvents)
				aiOps.POST("/admin/ai-candidates/:id/select", agentCtrl.SelectCandidate)
				aiOps.POST("/admin/ai-feedback", agentCtrl.SaveFeedback)
				aiOps.GET("/admin/ai-outcome-metrics", agentCtrl.OutcomeMetrics)
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
