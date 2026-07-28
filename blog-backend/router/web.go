package router

import (
	"database/sql"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
	"github.com/rushairer/gouno"
)

func RegisterWebRouter(server *gin.Engine, db *sql.DB, authOptions middleware.AuthOptions, jwksURL, redisDSN, visitorSecret, mediaDir string) {
	// Dynamic CORS Middleware
	server.Use(func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		if origin != "" {
			ctx.Header("Access-Control-Allow-Origin", origin)
		} else {
			ctx.Header("Access-Control-Allow-Origin", "*")
		}
		ctx.Header("Access-Control-Allow-Credentials", "true")
		ctx.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		ctx.Header("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
		if ctx.Request.Method == "OPTIONS" {
			ctx.AbortWithStatus(http.StatusNoContent)
			return
		}
		ctx.Next()
	})

	// Setup repository and service
	repo := repository.NewPostRepository(db)
	svc := service.NewPostService(repo)
	ctrl := controller.NewPostController(svc)
	feedCtrl := controller.NewFeedController(svc)
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
		server.Static("/media", mediaDir)
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
		api.GET("/posts", ctrl.List)
		api.GET("/posts/:slugOrID", ctrl.Get)
		api.POST("/posts/:slugOrID/view", growthCtrl.TrackView)
		api.GET("/posts/:slugOrID/related", growthCtrl.RelatedPosts)
		api.GET("/posts/:slugOrID/community", communityCtrl.State)
		api.POST("/posts/:slugOrID/like", communityCtrl.Like)
		api.PUT("/posts/:slugOrID/like", communityCtrl.Like)
		api.DELETE("/posts/:slugOrID/like", communityCtrl.Unlike)
		api.GET("/tags", ctrl.ListTags)

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
			admin.DELETE("/admin/media/:id", growthCtrl.DeleteMedia)
			admin.GET("/admin/analytics", growthCtrl.Analytics)
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
