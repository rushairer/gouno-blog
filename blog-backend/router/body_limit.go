package router

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

const (
	maxAPIJSONBody      = 2 << 20
	maxAPIMultipartBody = 11 << 20
)

// requestBodyLimitMiddleware applies a server-side cap before JSON binding can
// allocate an attacker-controlled request body. Media uploads keep a separate
// bounded allowance for their 10 MiB payload plus multipart framing.
func requestBodyLimitMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ctx.Request.Body == nil || ctx.Request.Method == http.MethodGet || ctx.Request.Method == http.MethodHead || ctx.Request.Method == http.MethodOptions {
			ctx.Next()
			return
		}
		limit := int64(maxAPIJSONBody)
		if strings.HasPrefix(strings.ToLower(ctx.GetHeader("Content-Type")), "multipart/form-data") {
			limit = maxAPIMultipartBody
		}
		if ctx.Request.ContentLength > limit {
			ctx.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gouno.NewErrorResponse(http.StatusRequestEntityTooLarge, "request body is too large"))
			return
		}
		ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, limit)
		ctx.Next()
	}
}
