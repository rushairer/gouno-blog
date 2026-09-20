package router

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	accesscontroller "github.com/rushairer/blog-backend/internal/access/controller"
	agentcontroller "github.com/rushairer/blog-backend/internal/agent/controller"
	analyticscontroller "github.com/rushairer/blog-backend/internal/analytics/controller"
	analyticsservice "github.com/rushairer/blog-backend/internal/analytics/service"
	"github.com/rushairer/blog-backend/internal/authbff"
	communitycontroller "github.com/rushairer/blog-backend/internal/community/controller"
	communityservice "github.com/rushairer/blog-backend/internal/community/service"
	connectorcontroller "github.com/rushairer/blog-backend/internal/connector/controller"
	feedcontroller "github.com/rushairer/blog-backend/internal/feed/controller"
	knowledgecontroller "github.com/rushairer/blog-backend/internal/knowledge/controller"
	"github.com/rushairer/blog-backend/internal/media"
	mediacontroller "github.com/rushairer/blog-backend/internal/media/controller"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	operationscontroller "github.com/rushairer/blog-backend/internal/operations/controller"
	pagecontroller "github.com/rushairer/blog-backend/internal/page/controller"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	postcontroller "github.com/rushairer/blog-backend/internal/post/controller"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
	postversioncontroller "github.com/rushairer/blog-backend/internal/postversion/controller"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
	"github.com/rushairer/blog-backend/internal/ratelimit"
	recommendationcontroller "github.com/rushairer/blog-backend/internal/recommendation/controller"
	recommendationservice "github.com/rushairer/blog-backend/internal/recommendation/service"
	sitecontroller "github.com/rushairer/blog-backend/internal/site/controller"
	siteservice "github.com/rushairer/blog-backend/internal/site/service"
	taxonomycontroller "github.com/rushairer/blog-backend/internal/taxonomy/controller"
	taxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"
	workflowcontroller "github.com/rushairer/blog-backend/internal/workflow/controller"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
	auth "github.com/rushairer/gouno/auth"
	"go.uber.org/zap"
)

type WebRouterOptions struct {
	DB                 *sql.DB
	AuthOptions        middleware.AuthOptions
	RedisDSN           string
	VisitorSecret      string
	MediaDir           string
	MediaStore         media.Store
	CORSAllowedOrigins []string
	PostSvc            *postservice.PostService
	PageSvc            *pageservice.PageService
	MediaSvc           mediaservice.Service
	TaxonomySvc        taxonomyservice.Service
	SiteSvc            siteservice.Service
	CommunitySvc       *communityservice.CommunityService
	AnalyticsSvc       analyticsservice.Service
	RecommendationSvc  recommendationservice.Service
	PostVersionSvc     postversionservice.Service
	AgentCtrl          *agentcontroller.Controller
	KnowledgeCtrl      *knowledgecontroller.Controller
	ConnectorCtrl      *connectorcontroller.Controller
	OperationsCtrl     *operationscontroller.Controller
	WorkflowCtrl       *workflowcontroller.Controller
	Logger             *zap.Logger
	Verifier           *auth.Verifier
	AccessService      *access.Service
	SecureCookies      bool
	BFFClient          *authbff.Client
}

func RegisterWebRouterWithOptions(server *gin.Engine, opts WebRouterOptions) {
	if opts.PostSvc == nil || opts.PageSvc == nil || opts.MediaSvc == nil || opts.TaxonomySvc == nil || opts.SiteSvc == nil || opts.CommunitySvc == nil || opts.AnalyticsSvc == nil || opts.RecommendationSvc == nil || opts.PostVersionSvc == nil {
		panic("RegisterWebRouterWithOptions: all application services are required")
	}
	if opts.Verifier == nil || opts.AccessService == nil {
		panic("RegisterWebRouterWithOptions: verifier and access service are required")
	}
	server.Use(middleware.CORSMiddleware(opts.CORSAllowedOrigins))
	server.Use(middleware.RequestBodyLimitMiddleware())
	server.Use(middleware.BlogCSRFMiddleware(opts.SecureCookies))
	if opts.BFFClient != nil {
		server.Use(opts.BFFClient.SessionMiddleware())
		opts.BFFClient.RegisterRoutes(server)
	}
	if opts.ConnectorCtrl != nil {
		server.GET("/api/auth/connectors/google/callback", opts.ConnectorCtrl.CompleteSearchConsoleOAuthCallback)
	}
	server.GET("/healthz", func(ctx *gin.Context) {
		if opts.DB == nil || opts.DB.PingContext(ctx.Request.Context()) != nil {
			ctx.Status(http.StatusServiceUnavailable)
			return
		}
		ctx.Status(http.StatusNoContent)
	})

	postSvc := opts.PostSvc
	ctrl := postcontroller.NewPostController(postSvc)

	pageSvc := opts.PageSvc
	pageCtrl := pagecontroller.NewPageController(pageSvc)

	taxonomySvc := opts.TaxonomySvc
	taxonomyCtrl := taxonomycontroller.New(taxonomySvc)

	siteSvc := opts.SiteSvc
	siteCtrl := sitecontroller.New(siteSvc)

	feedCtrl := feedcontroller.NewFeedController(postSvc, pageSvc, siteSvc)

	communitySvc := opts.CommunitySvc
	var interactionLimiter ratelimit.Limiter
	if opts.RedisDSN != "" {
		if limiter, err := ratelimit.NewRedisLimiter(opts.RedisDSN); err == nil {
			interactionLimiter = limiter
		}
	}
	communityCtrl := communitycontroller.NewCommunityController(communitySvc, interactionLimiter, opts.VisitorSecret, opts.Logger)

	mediaCtrl := mediacontroller.New(opts.MediaSvc, opts.MediaStore)
	analyticsCtrl := analyticscontroller.New(opts.AnalyticsSvc, communitySvc)
	recommendationCtrl := recommendationcontroller.New(opts.RecommendationSvc, communitySvc)
	postVersionCtrl := postversioncontroller.New(opts.PostVersionSvc, postSvc)

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
	agentCtrl := opts.AgentCtrl
	knowledgeCtrl := opts.KnowledgeCtrl
	connectorCtrl := opts.ConnectorCtrl
	operationsCtrl := opts.OperationsCtrl
	workflowCtrl := opts.WorkflowCtrl

	// RSS & Sitemap Routes
	server.GET("/feed.xml", feedCtrl.GetRSS)
	server.GET("/rss", feedCtrl.GetRSS)
	server.GET("/sitemap.xml", feedCtrl.GetSitemap)

	// Setup JWT verifier
	verifier := opts.Verifier
	userAuthOptions := authOptions
	userAuthOptions.RequiredRole = ""
	userAuth := middleware.AuthMiddlewareWithOptions(verifier, userAuthOptions)
	optionalAuth := middleware.OptionalAuth(verifier, userAuthOptions)
	accessService := opts.AccessService
	accessAuth := middleware.BlogAccess(accessService)
	optionalAccessAuth := middleware.OptionalBlogAccess(accessService)
	accessCtrl := accesscontroller.New(accessService)

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
		if workflowCtrl != nil {
			api.POST("/ai/webhooks/:event", workflowCtrl.ReceiveWorkflowWebhook)
		}
		api.GET("/posts", ctrl.List)
		api.GET("/posts/:slugOrID", ctrl.Get)
		api.POST("/posts/:slugOrID/view", analyticsCtrl.TrackView)
		api.GET("/posts/:slugOrID/related", recommendationCtrl.RelatedPosts)
		api.GET("/posts/:slugOrID/community", communityCtrl.State)
		api.POST("/posts/:slugOrID/like", communityCtrl.Like)
		api.PUT("/posts/:slugOrID/like", communityCtrl.Like)
		api.DELETE("/posts/:slugOrID/like", communityCtrl.Unlike)
		api.GET("/tags", ctrl.ListTags)
		api.GET("/tags/summary", taxonomyCtrl.ListPublishedTagSummaries)
		api.GET("/categories", taxonomyCtrl.ListCategories)
		api.GET("/categories/:slug/posts", taxonomyCtrl.ListCategoryPosts)
		api.GET("/pages/nav", pageCtrl.GetNavPages)
		api.GET("/pages/:slug", pageCtrl.GetPublicBySlug)
		api.GET("/site", siteCtrl.GetSiteSettings)

		api.GET("/posts/:slugOrID/comments", communityCtrl.GetComments)
		api.POST("/posts/:slugOrID/comments", communityCtrl.CreateComment)
		api.POST("/comments/:id/report", communityCtrl.ReportComment)

		me := api.Group("/me")
		me.Use(userAuth, accessAuth, middleware.RequireActiveBlogMembership())
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
		members.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageMembers), middleware.RequireAAL2(), middleware.RequireRecentMFAForUnsafeMethods(), middleware.AuditSensitiveChanges(accessService))
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
			moderate.GET("/posts/:slugOrID/comments/all", communityCtrl.GetAllComments)
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
			author.GET("/admin/posts/:id/versions", postVersionCtrl.ListVersions)
			author.POST("/admin/posts/:id/versions/:versionID/restore", postVersionCtrl.RestoreVersion)
			author.GET("/admin/categories", taxonomyCtrl.ListCategories)
			author.GET("/admin/tags", taxonomyCtrl.ListAdminTags)
			author.GET("/admin/media", mediaCtrl.List)
			author.POST("/admin/media", mediaCtrl.Upload)
			author.PUT("/admin/media/:id", mediaCtrl.Update)
			author.GET("/admin/media/:id/references", mediaCtrl.References)
			author.DELETE("/admin/media/:id", mediaCtrl.Delete)
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
			contentManage.POST("/admin/categories", taxonomyCtrl.CreateCategory)
			contentManage.PUT("/admin/categories/:id", taxonomyCtrl.UpdateCategory)
			contentManage.DELETE("/admin/categories/:id", taxonomyCtrl.DeleteCategory)
			contentManage.PUT("/admin/tags/:name", taxonomyCtrl.RenameTag)
			contentManage.POST("/admin/tags/merge", taxonomyCtrl.MergeTags)
			contentManage.DELETE("/admin/tags/:name", taxonomyCtrl.DeleteTag)
		}

		// Analytics / General Overview (Any active Blog staff role)
		staffOverview := api.Group("")
		staffOverview.Use(userAuth, accessAuth, middleware.RequireActiveBlogMembership())
		{
			staffOverview.GET("/admin/analytics", analyticsCtrl.Summary)
		}

		// Site Settings (Admins, Owners)
		siteSettings := api.Group("")
		siteSettings.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageSite))
		siteSettings.Use(middleware.RequireAAL2(), middleware.RequireRecentMFAForUnsafeMethods(), middleware.AuditSensitiveChanges(accessService))
		{
			siteSettings.GET("/admin/settings", siteCtrl.GetSiteSettings)
			siteSettings.PUT("/admin/settings", siteCtrl.UpdateSiteSettings)
		}

		// AI Operations & Automated Agents (AI Managers, Admins, Owners)
		aiOps := api.Group("")
		aiOps.Use(userAuth, accessAuth, middleware.RequireBlogPermission(accessService, access.PermissionManageAI), middleware.RequireAAL2(), middleware.RequireRecentMFAForUnsafeMethods(), middleware.AuditSensitiveChanges(accessService))
		{
			if workflowCtrl != nil {
				aiOps.POST("/admin/ai-workflows/draft", workflowCtrl.DraftWorkflow)
				aiOps.GET("/admin/ai-workflows", workflowCtrl.ListWorkflows)
				aiOps.POST("/admin/ai-workflows", workflowCtrl.CreateWorkflow)
				aiOps.GET("/admin/ai-workflows/:id", workflowCtrl.GetWorkflow)
				aiOps.PUT("/admin/ai-workflows/:id", workflowCtrl.UpdateWorkflow)
				aiOps.DELETE("/admin/ai-workflows/:id", workflowCtrl.DeleteWorkflow)
				aiOps.GET("/admin/ai-workflows/:id/versions", workflowCtrl.ListWorkflowVersions)
				aiOps.POST("/admin/ai-workflows/:id/rollback", workflowCtrl.RollbackWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/enable", workflowCtrl.EnableWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/disable", workflowCtrl.DisableWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/run", workflowCtrl.RunWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/dry-run", workflowCtrl.DryRunWorkflow)
				aiOps.POST("/admin/ai-workflows/:id/preflight", workflowCtrl.PreflightWorkflow)
				aiOps.GET("/admin/ai-workflow-runs", workflowCtrl.ListWorkflowRuns)
				aiOps.DELETE("/admin/ai-workflow-runs/:id", workflowCtrl.DeleteWorkflowRun)
				aiOps.POST("/admin/ai-workflow-runs/:id/cancel", workflowCtrl.CancelWorkflowRun)
				aiOps.GET("/admin/ai-workflow-runs/:id/steps", workflowCtrl.WorkflowRunSteps)
				aiOps.GET("/admin/ai-workflow-runs/:id/resources", workflowCtrl.WorkflowRunResources)
				aiOps.GET("/admin/ai-workflow-runs/:id/interactions", workflowCtrl.WorkflowRunInteractions)
				aiOps.GET("/admin/ai-workflow-runs/:id/events", workflowCtrl.WorkflowRunEvents)
				aiOps.GET("/admin/ai-interactions/:id", workflowCtrl.GetInteraction)
				aiOps.GET("/admin/ai-interactions", workflowCtrl.ListPendingInteractions)
				aiOps.POST("/admin/ai-interactions/:id/resolve", workflowCtrl.ResolveInteraction)
				aiOps.POST("/admin/ai-interactions/:id/cancel", workflowCtrl.CancelInteraction)
				aiOps.POST("/admin/ai-workflow-runs/:id/retry", workflowCtrl.RetryWorkflowRun)
				aiOps.POST("/admin/ai-workflow-events", workflowCtrl.EmitWorkflowEvent)
				aiOps.GET("/admin/ai-resources/:type", workflowCtrl.ListAIResources)
				aiOps.GET("/admin/ai-workflow-metrics", workflowCtrl.WorkflowMetrics)
			}
			if operationsCtrl != nil {
				aiOps.GET("/admin/ai-suggestions", operationsCtrl.ListSuggestions)
				aiOps.POST("/admin/ai-suggestions/refresh", operationsCtrl.RefreshSuggestions)
				aiOps.POST("/admin/ai-suggestions/:id/ignore", operationsCtrl.IgnoreSuggestion)
				aiOps.POST("/admin/ai-suggestions/:id/convert", operationsCtrl.ConvertSuggestion)
				aiOps.GET("/admin/ai-editorial-tasks", operationsCtrl.ListEditorialTasks)
				aiOps.POST("/admin/ai-editorial-tasks/:id/status", operationsCtrl.UpdateEditorialTaskStatus)
				aiOps.GET("/admin/ai-candidates", operationsCtrl.ListCandidateSets)
				aiOps.POST("/admin/ai-candidates/:id/select", operationsCtrl.SelectCandidate)
				aiOps.POST("/admin/ai-feedback", operationsCtrl.SaveFeedback)
				aiOps.GET("/admin/ai-outcome-metrics", operationsCtrl.OutcomeMetrics)
			}
			if agentCtrl != nil {
				aiOps.POST("/admin/ai-workflows/agent-drafts", agentCtrl.DraftWorkflowAgents)
				aiOps.GET("/admin/provider-profiles", agentCtrl.ListProviders)
				aiOps.GET("/admin/provider-profiles/export", middleware.RequireRecentMFA(), agentCtrl.ExportProviders)
				aiOps.POST("/admin/provider-profiles/import", agentCtrl.ImportProviders)
				aiOps.POST("/admin/provider-profiles", agentCtrl.CreateProvider)
				aiOps.PUT("/admin/provider-profiles/:id", agentCtrl.UpdateProvider)
				aiOps.DELETE("/admin/provider-profiles/:id", agentCtrl.DeleteProvider)
				aiOps.POST("/admin/provider-profiles/:id/test", agentCtrl.TestProvider)
				aiOps.POST("/admin/provider-profiles/:id/default/:purpose", agentCtrl.SetDefaultProvider)
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
				aiOps.GET("/admin/ai-workflow-runs/:id/media-candidates", agentCtrl.WorkflowRunMediaCandidates)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/select", agentCtrl.SelectWorkflowImageTasks)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/apply", agentCtrl.ApplyWorkflowImageTasks)
				aiOps.POST("/admin/ai-workflow-runs/:id/media-candidates/reject", agentCtrl.RejectWorkflowImageTasks)
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
			}
			if knowledgeCtrl != nil {
				aiOps.GET("/admin/embedding-profiles", knowledgeCtrl.ListEmbeddingProfiles)
				aiOps.POST("/admin/embedding-profiles", knowledgeCtrl.CreateEmbeddingProfile)
				aiOps.PUT("/admin/embedding-profiles/:id", knowledgeCtrl.UpdateEmbeddingProfile)
				aiOps.DELETE("/admin/embedding-profiles/:id", knowledgeCtrl.DeleteEmbeddingProfile)
				aiOps.POST("/admin/embedding-profiles/:id/test", knowledgeCtrl.TestEmbeddingProfile)
				aiOps.GET("/admin/ai-index/status", knowledgeCtrl.IndexStatus)
				aiOps.GET("/admin/ai-index/content", knowledgeCtrl.ListIndexContent)
				aiOps.GET("/admin/ai-index/search", knowledgeCtrl.SearchIndex)
				aiOps.POST("/admin/ai-index/rebuild", knowledgeCtrl.RebuildIndex)
				aiOps.POST("/admin/ai-index/retry", knowledgeCtrl.RetryIndex)
				aiOps.PUT("/admin/ai-index/evaluation-cases", knowledgeCtrl.ReplaceIndexEvaluation)
				aiOps.POST("/admin/ai-index/evaluate", knowledgeCtrl.EvaluateIndex)
			}
			if connectorCtrl != nil {
				aiOps.GET("/admin/ai-connectors", connectorCtrl.ListConnectorProfiles)
				aiOps.POST("/admin/ai-connectors", connectorCtrl.SaveConnectorProfile)
				aiOps.POST("/admin/ai-connectors/:id/oauth/start", connectorCtrl.BeginConnectorOAuth)
				aiOps.GET("/admin/ai-connectors/:id/oauth/start", middleware.RequireRecentMFA(), connectorCtrl.BeginSearchConsoleOAuthRedirect)
				aiOps.POST("/admin/ai-connectors/oauth/callback", connectorCtrl.CompleteConnectorOAuth)
				aiOps.POST("/admin/ai-connectors/:id/search-console/summary", connectorCtrl.SearchConsoleSummary)
				aiOps.GET("/admin/ai-connector-outbox", connectorCtrl.ListConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox", connectorCtrl.QueueConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/approve", connectorCtrl.ApproveConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/revoke", connectorCtrl.RevokeConnectorOutbox)
				aiOps.POST("/admin/ai-connector-outbox/:id/deliver-mock", connectorCtrl.DeliverConnectorOutboxMock)
				aiOps.POST("/admin/ai-connector-outbox/:id/retry", connectorCtrl.RetryConnectorOutbox)
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
