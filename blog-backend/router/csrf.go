package router

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

const blogCSRFCookie = "blog_csrf_token"

func blogCSRFMiddleware(secure bool) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ctx.Request.Method == http.MethodGet || ctx.Request.Method == http.MethodHead || ctx.Request.Method == http.MethodOptions {
			ensureBlogCSRFCookie(ctx, secure)
			ctx.Next()
			return
		}
		// The public webhook authenticates itself with a body HMAC.
		if strings.HasPrefix(ctx.Request.URL.Path, "/api/ai/webhooks/") {
			ctx.Next()
			return
		}
		cookie, err := ctx.Cookie(blogCSRFCookie)
		header := ctx.GetHeader("X-CSRF-Token")
		if err != nil || cookie == "" || header == "" || subtle.ConstantTimeCompare([]byte(cookie), []byte(header)) != 1 {
			ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "CSRF token mismatch"))
			return
		}
		ctx.Next()
	}
}

func ensureBlogCSRFCookie(ctx *gin.Context, secure bool) {
	if value, _ := ctx.Cookie(blogCSRFCookie); value != "" {
		return
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		ctx.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	http.SetCookie(ctx.Writer, &http.Cookie{Name: blogCSRFCookie, Value: hex.EncodeToString(bytes), Path: "/", MaxAge: 24 * 60 * 60, HttpOnly: false, Secure: secure, SameSite: http.SameSiteLaxMode})
}
