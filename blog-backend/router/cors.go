package router

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	return middleware.CORSMiddleware(allowedOrigins)
}
