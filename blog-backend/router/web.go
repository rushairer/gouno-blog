package router

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

func RegisterWebRouter(server *gin.Engine, db *sql.DB, authOptions middleware.AuthOptions, jwksURL, redisDSN, visitorSecret, mediaDir string, corsAllowedOrigins []string, agentCtrl *controller.AgentController) {
	server.Use(corsMiddleware(corsAllowedOrigins))

	// Setup repository and service
	repo := repository.NewPostRepository(db)
	svc := service.NewPostService(repo)
	ctrl := controller.NewPostController(svc)
	contentCtrl := controller.NewContentController(db)
	feedCtrl := controller.NewFeedController(svc, db)
	communitySvc := service.NewCommunityService(repository.NewCommunityRepository(db), repo)
	var interactionLimiter service.RateLimiter
	if redisDSN != "" {
		if limiter, err := service.NewRedisRateLimiter(redisDSN); err == nil {
			interactionLimiter = limiter
		}
	}
	communityCtrl := controller.NewCommunityController(communitySvc, interactionLimiter, visitorSecret)
	growthSvc := service.NewGrowthService(repository.NewGrowthRepository(db))
	growthCtrl := controller.NewGrowthController(growthSvc, svc, communitySvc, mediaDir)
	if err := os.MkdirAll(mediaDir, 0o755); err == nil {
		serveMedia := func(ctx *gin.Context) {
			filename := ctx.Param("filename")
			if filename == "" || filename != filepath.Base(filename) || filename == "." {
				ctx.Status(http.StatusNotFound)
				return
			}
			ctx.File(filepath.Join(mediaDir, filename))
		}
		server.GET("/media/:filename", serveMedia)
		server.HEAD("/media/:filename", serveMedia)
	}

	// RSS & Sitemap Routes
	server.GET("/feed.xml", feedCtrl.GetRSS)
	server.GET("/rss", feedCtrl.GetRSS)
	server.GET("/sitemap.xml", feedCtrl.GetSitemap)

	// Setup JWT verifier
	verifier := middleware.NewJWTVerifier(jwksURL)
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
		api.GET("/categories", contentCtrl.ListCategories)
		api.GET("/categories/:slug/posts", contentCtrl.ListCategoryPosts)
		api.GET("/site", contentCtrl.GetSiteSettings)

		api.GET("/posts/:slugOrID/comments", communityCtrl.GetComments)
		api.POST("/posts/:slugOrID/comments", communityCtrl.CreateComment)
		api.POST("/comments/:id/report", communityCtrl.ReportComment)

		me := api.Group("/me")
		me.Use(userAuth)
		{
			me.GET("/bookmarks", communityCtrl.ListBookmarks)
			me.PUT("/bookmarks/:postID", func(c *gin.Context) { communityCtrl.SetBookmark(c, true) })
			me.DELETE("/bookmarks/:postID", func(c *gin.Context) { communityCtrl.SetBookmark(c, false) })
			me.GET("/notifications", communityCtrl.ListNotifications)
			me.PUT("/notifications/read-all", communityCtrl.ReadAllNotifications)
			me.PUT("/notifications/:id/read", communityCtrl.ReadNotification)
		}

		// Protected Blog Routes (Admin Only)
		admin := api.Group("")
		admin.Use(adminAuth)
		{
			admin.POST("/posts", ctrl.Create)
			admin.GET("/admin/posts", ctrl.ListAdmin)
			admin.GET("/admin/posts/:id", contentCtrl.GetAdminPost)
			admin.POST("/admin/posts/batch", contentCtrl.BatchPosts)
			admin.PUT("/posts/:slugOrID", ctrl.Update)
			admin.DELETE("/posts/:slugOrID", ctrl.Delete)
			admin.GET("/posts/:slugOrID/comments/all", ctrl.GetAllComments)
			admin.GET("/admin/comments", communityCtrl.ListAdminComments)
			admin.PUT("/admin/comments/:id", communityCtrl.ModerateComment)
			admin.PUT("/comments/:id/visibility", communityCtrl.LegacyVisibility)
			admin.DELETE("/comments/:id", communityCtrl.DeleteComment)
			admin.GET("/admin/posts/:id/versions", growthCtrl.ListVersions)
			admin.POST("/admin/posts/:id/versions/:versionID/restore", growthCtrl.RestoreVersion)
			admin.GET("/admin/media", growthCtrl.ListMedia)
			admin.POST("/admin/media", growthCtrl.UploadMedia)
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
				admin.POST("/admin/ai-workflows/draft", agentCtrl.DraftWorkflow)
				admin.POST("/admin/ai-automation-plans/draft", agentCtrl.DraftAutomationPlan)
				admin.GET("/admin/provider-profiles", agentCtrl.ListProviders)
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
				admin.GET("/admin/ai-workflow-runs/:id/steps", agentCtrl.WorkflowRunSteps)
				admin.GET("/admin/ai-workflow-runs/:id/resources", agentCtrl.WorkflowRunResources)
				admin.GET("/admin/ai-workflow-runs/:id/interactions", agentCtrl.WorkflowRunInteractions)
				admin.GET("/admin/ai-workflow-runs/:id/media-candidates", agentCtrl.WorkflowRunMediaCandidates)
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
				admin.POST("/admin/ai-image-tasks/:id/select", agentCtrl.SelectImageTask)
				admin.POST("/admin/ai-image-tasks/:id/apply", agentCtrl.ApplyImageTask)
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
