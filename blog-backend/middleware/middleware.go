package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	gounoMiddleware "github.com/rushairer/gouno/middleware"
)

func TimeoutMiddleware(requestTimeout time.Duration) gin.HandlerFunc {
	return TimeoutMiddlewareWithOverrides(requestTimeout, nil)
}

// TimeoutMiddlewareWithOverrides applies route-specific deadlines using Gin
// route templates (for example, /api/items/:id), falling back to the request
// path when no matched template is available.
func TimeoutMiddlewareWithOverrides(requestTimeout time.Duration, overrides map[string]time.Duration) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		deadline := requestTimeout
		route := ctx.FullPath()
		if route == "" {
			route = ctx.Request.URL.Path
		}
		if value, ok := overrides[route]; ok && value > 0 {
			deadline = value
		}
		runRequestWithTimeout(ctx, deadline)
	}
}

// SecurityHeadersMiddleware sets application-level headers that are not owned
// by the edge gateway. Caddy is the single Content-Security-Policy authority
// for Blog responses, preventing browsers from receiving accidental policy
// intersections from the gateway, frontend, and backend.
func SecurityHeadersMiddleware(isProduction bool) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		gounoMiddleware.SecurityHeaders(gounoMiddleware.SecurityHeadersOptions{
			IsProduction:      isProduction,
			PermissionsPolicy: "geolocation=(), camera=(), microphone=(), payment=()",
		})(ctx)
	}
}
