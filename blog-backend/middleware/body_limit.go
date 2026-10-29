package middleware

import (
	"mime"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
)

const (
	MaxAPIJSONBody      = 2 << 20
	MaxAPIMultipartBody = 11 << 20
)

// RequestBodyLimitMiddleware applies a server-side cap before JSON binding can
// allocate an attacker-controlled request body. Media uploads keep a separate
// bounded allowance for their 10 MiB payload plus multipart framing.
func RequestBodyLimitMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ctx.Request.Body == nil || ctx.Request.Method == http.MethodGet || ctx.Request.Method == http.MethodHead || ctx.Request.Method == http.MethodOptions {
			ctx.Next()
			return
		}
		limit := int64(MaxAPIJSONBody)
		if isMediaMultipartUpload(ctx) {
			limit = MaxAPIMultipartBody
		}
		if ctx.Request.ContentLength > limit {
			ctx.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gouno.NewErrorResponse(http.StatusRequestEntityTooLarge, "request body is too large"))
			return
		}
		ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, limit)
		ctx.Next()
	}
}

// isMediaMultipartUpload grants larger framing only on the real Media route.
func isMediaMultipartUpload(ctx *gin.Context) bool {
	if ctx.Request.Method != http.MethodPost || ctx.FullPath() != "/api/admin/media" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(ctx.GetHeader("Content-Type"))
	return err == nil && mediaType == "multipart/form-data"
}
