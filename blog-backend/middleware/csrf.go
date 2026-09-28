package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	gounoMiddleware "github.com/rushairer/gouno/middleware"
)

const BlogCSRFCookie = "__Host-blog-csrf"

const BlogCSRFMaxAge = 24 * time.Hour

func BlogCSRFMiddleware(secure bool) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ctx.Request.Method == http.MethodGet || ctx.Request.Method == http.MethodHead || ctx.Request.Method == http.MethodOptions {
			if err := gounoMiddleware.EnsureCSRFCookie(ctx, BlogCSRFCookie, secure, BlogCSRFMaxAge); err != nil {
				ctx.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			ctx.Next()
			return
		}
		// The public webhook authenticates itself with a body HMAC.
		// OIDC backchannel-logout authenticates itself with a signed JWT logout_token.
		// External Capability v1 is a machine-to-machine API authenticated by its
		// own explicit Bearer API key; browser-facing /api routes remain subject
		// to the normal CSRF contract.
		if strings.HasPrefix(ctx.Request.URL.Path, "/api/ai/webhooks/") ||
			strings.HasPrefix(ctx.Request.URL.Path, "/api/external/v1/") ||
			ctx.Request.URL.Path == "/api/auth/backchannel-logout" {
			ctx.Next()
			return
		}
		cookie, err := ctx.Cookie(BlogCSRFCookie)
		header := ctx.GetHeader("X-CSRF-Token")
		if err != nil || !gounoMiddleware.CSRFMatches(cookie, header) {
			ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "CSRF token mismatch"))
			return
		}
		// Rotate the token after successful validation to prevent fixation.
		if token, genErr := gounoMiddleware.GenerateCSRFToken(); genErr == nil {
			gounoMiddleware.SetCSRFCookie(ctx, BlogCSRFCookie, token, secure, BlogCSRFMaxAge)
		}
		ctx.Next()
	}
}
