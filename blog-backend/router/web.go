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

func RegisterWebRouter(server *gin.Engine, db *sql.DB, authOptions middleware.AuthOptions, jwksURL string) {
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

	// RSS & Sitemap Routes
	server.GET("/feed.xml", feedCtrl.GetRSS)
	server.GET("/rss", feedCtrl.GetRSS)
	server.GET("/sitemap.xml", feedCtrl.GetSitemap)

	// Setup JWT verifier
	verifier := middleware.NewJWTVerifier(jwksURL)
	authOptions.RequiredRole = "admin"
	adminAuth := middleware.AuthMiddlewareWithOptions(verifier, authOptions)

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
	{
		api.GET("/posts", ctrl.List)
		api.GET("/posts/:slugOrID", ctrl.Get)
		api.POST("/posts/:slugOrID/view", ctrl.IncrementViews)
		api.POST("/posts/:slugOrID/like", ctrl.IncrementLikes)
		api.GET("/tags", ctrl.ListTags)

		api.GET("/posts/:slugOrID/comments", ctrl.GetComments)
		api.POST("/posts/:slugOrID/comments", ctrl.CreateComment)

		// Protected Blog Routes (Admin Only)
		admin := api.Group("")
		admin.Use(adminAuth)
		{
			admin.POST("/posts", ctrl.Create)
			admin.GET("/admin/posts", ctrl.ListAdmin)
			admin.PUT("/posts/:id", ctrl.Update)
			admin.DELETE("/posts/:id", ctrl.Delete)
			admin.GET("/posts/:slugOrID/comments/all", ctrl.GetAllComments)
			admin.PUT("/comments/:id/visibility", ctrl.UpdateCommentVisibility)
			admin.DELETE("/comments/:id", ctrl.DeleteComment)
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
