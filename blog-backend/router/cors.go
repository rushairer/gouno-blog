package router

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

var corsMethods = map[string]struct{}{
	http.MethodGet: {}, http.MethodHead: {}, http.MethodOptions: {},
	http.MethodPost: {}, http.MethodPut: {}, http.MethodPatch: {}, http.MethodDelete: {},
}

func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		if normalized, ok := normalizedOrigin(origin); ok {
			allowed[normalized] = struct{}{}
		}
	}

	return func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		if origin == "" {
			ctx.Next()
			return
		}

		normalized, valid := normalizedOrigin(origin)
		_, explicitlyAllowed := allowed[normalized]
		permitted := valid && (explicitlyAllowed || sameOrigin(ctx, normalized))
		if !permitted {
			if ctx.Request.Method == http.MethodOptions || unsafeMethod(ctx.Request.Method) {
				ctx.AbortWithStatusJSON(http.StatusForbidden, gouno.NewErrorResponse(http.StatusForbidden, "cross-origin request is not allowed"))
				return
			}
			ctx.Next()
			return
		}

		ctx.Header("Vary", "Origin")
		ctx.Header("Access-Control-Allow-Origin", normalized)
		ctx.Header("Access-Control-Allow-Credentials", "true")
		if ctx.Request.Method == http.MethodOptions {
			ctx.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, Accept-Encoding, Cache-Control, X-Requested-With")
			ctx.Header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			ctx.AbortWithStatus(http.StatusNoContent)
			return
		}
		ctx.Next()
	}
}

func normalizedOrigin(value string) (string, bool) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), true
}

func sameOrigin(ctx *gin.Context, origin string) bool {
	scheme := "http"
	if ctx.Request.TLS != nil || strings.EqualFold(ctx.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return origin == scheme+"://"+strings.ToLower(ctx.Request.Host)
}

func unsafeMethod(method string) bool {
	_, safe := corsMethods[method]
	return !safe || (method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions)
}
