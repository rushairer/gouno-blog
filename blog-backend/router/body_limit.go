package router

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

const maxAPIJSONBody = middleware.MaxAPIJSONBody

func requestBodyLimitMiddleware() gin.HandlerFunc {
	return middleware.RequestBodyLimitMiddleware()
}
