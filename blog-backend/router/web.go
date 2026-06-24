package router

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	"github.com/rushairer/blog-backend/internal/controller"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
	"github.com/rushairer/blog-backend/middleware"
)

func RegisterWebRouter(server *gin.Engine, db *sql.DB, jwksURL string) {
	// CORS Middleware to allow requests from port 8081
	server.Use(func(ctx *gin.Context) {
		ctx.Header("Access-Control-Allow-Origin", "http://localhost:8081")
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

	// Setup JWT verifier
	verifier := middleware.NewJWTVerifier(jwksURL)
	adminAuth := middleware.AuthMiddleware(verifier, "admin")

	registerWebTestRouter(server)
	registerWebIndexRouter(server)

	// Public Blog Routes
	api := server.Group("/api")
	{
		api.GET("/posts", ctrl.List)
		api.GET("/posts/:slugOrID", ctrl.Get)
		api.GET("/tags", ctrl.ListTags)
		
		api.GET("/posts/:slugOrID/comments", ctrl.GetComments)
		api.POST("/posts/:slugOrID/comments", ctrl.CreateComment)

		// Protected Blog Routes (Admin Only)
		admin := api.Group("")
		admin.Use(adminAuth)
		{
			admin.POST("/posts", ctrl.Create)
			admin.PUT("/posts/:id", ctrl.Update)
			admin.DELETE("/posts/:id", ctrl.Delete)
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
