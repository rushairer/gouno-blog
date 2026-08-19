package router

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/middleware"
)

const blogCSRFCookie = middleware.BlogCSRFCookie

func blogCSRFMiddleware(secure bool) gin.HandlerFunc {
	return middleware.BlogCSRFMiddleware(secure)
}
