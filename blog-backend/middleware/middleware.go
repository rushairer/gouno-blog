package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-contrib/timeout"
	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

func TimeoutMiddleware(requestTimeout time.Duration) gin.HandlerFunc {
	return timeout.New(
		timeout.WithTimeout(requestTimeout),
		timeout.WithResponse(
			func(ctx *gin.Context) {
				ctx.JSON(http.StatusRequestTimeout, gouno.NewRequestTimeoutResponse())
			},
		),
	)
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

// SecurityHeadersMiddleware sets common security response headers.
func SecurityHeadersMiddleware(isProduction bool) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		ctx.Header("X-Content-Type-Options", "nosniff")
		ctx.Header("X-Frame-Options", "DENY")
		ctx.Header("X-XSS-Protection", "0")
		ctx.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		if isProduction {
			ctx.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}
		ctx.Header("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()")
		ctx.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
		ctx.Next()
	}
}
