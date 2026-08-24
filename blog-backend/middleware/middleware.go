package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"strings"
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

// SecurityHeadersMiddleware sets common security response headers, delegating
// the shared static headers to the gouno framework and keeping the
// blog-specific CSP policy (with the swagger docs exception) local.
func SecurityHeadersMiddleware(isProduction bool) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		csp := "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
		if strings.HasPrefix(ctx.Request.URL.Path, "/swagger") {
			csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://unpkg.com; connect-src 'self' https://unpkg.com;"
		}
		gounoMiddleware.SecurityHeaders(gounoMiddleware.SecurityHeadersOptions{
			IsProduction:      isProduction,
			CSP:               csp,
			PermissionsPolicy: "geolocation=(), camera=(), microphone=(), payment=()",
		})(ctx)
	}
}
