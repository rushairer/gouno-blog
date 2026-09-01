package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-contrib/timeout"
	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
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
		timeout.New(timeout.WithTimeout(deadline), timeout.WithResponse(func(ctx *gin.Context) {
			ctx.JSON(http.StatusRequestTimeout, gouno.NewRequestTimeoutResponse())
		}))(ctx)
	}
}

func RecoveryMiddleware() gin.HandlerFunc {
	return gin.CustomRecovery(
		func(ctx *gin.Context, err any) {
			// Log the panic with stack trace for debugging
			stack := string(debug.Stack())
			ctx.Error(&gin.Error{
				Err:  fmt.Errorf("panic recovered: %v\n%s", err, stack),
				Type: gin.ErrorTypePrivate,
			})
			ctx.JSON(http.StatusInternalServerError, gouno.NewInternalServerErrorResponse())
		},
	)
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
