package middleware

import (
	"errors"
	"net/http"
	"syscall"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/gouno"
	"go.uber.org/zap"
)

// RecoveryMiddleware is the request panic boundary. Gin's default recovery
// logger formats the panic (and, in some modes, dumps the request) before calling
// a custom handler. Owning the boundary avoids that second, unsanitized sink.
func RecoveryMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		defer func() {
			if value := recover(); value != nil {
				ctx.Abort()
				if recordRequestPanic(ctx, value) {
					// Returning would let Gin finalize an unwritten response as 200.
					panic(http.ErrAbortHandler)
				}
				if ctx.Writer.Written() {
					// A 500 envelope cannot replace bytes already sent. Let net/http
					// abort the stream without logging the original panic again.
					panic(http.ErrAbortHandler)
				}
				ctx.JSON(http.StatusInternalServerError, gouno.NewInternalServerErrorResponse())
			}
		}()
		ctx.Next()
	}
}

// recordRequestPanic keeps diagnostics private and fixed. Its return value
// identifies the same disconnected-request classes handled by Gin recovery.
func recordRequestPanic(ctx *gin.Context, value any) bool {
	var stack zap.Field
	if workerPanic, ok := value.(requestPanic); ok {
		value, stack = workerPanic.value, workerPanic.stack
	}
	logger := recoveryLogger(ctx)
	// FullPath is a registered template; no raw URL, request ID, headers or body.
	fields := []zap.Field{zap.String("route", ctx.FullPath())}
	if recoveryConnectionAborted(value) {
		const message = "request connection aborted"
		_ = ctx.Error(errors.New(message)).SetType(gin.ErrorTypePrivate)
		logger.Warn(message, fields...)
		return true
	}
	const message = "request panic recovered"
	_ = ctx.Error(errors.New(message)).SetType(gin.ErrorTypePrivate)
	if stack.Key == "" {
		stack = zap.Stack("stack")
	}
	// Zap captures function/file/line frames, never source text or arguments.
	// Never format value or pass it to zap.Any/Error, even for private logs.
	logger.Error(message, append(fields, stack)...)
	return false
}

func recoveryLogger(ctx *gin.Context) *zap.Logger {
	if raw, ok := ctx.Get("logger"); ok {
		if logger, ok := raw.(*zap.Logger); ok && logger != nil {
			return logger
		}
	}
	return zap.L()
}

func recoveryConnectionAborted(value any) (aborted bool) {
	// Error implementations can themselves panic in Is/Unwrap. A classification
	// failure remains a generic request panic, never a second raw panic escape.
	defer func() {
		if recover() != nil {
			aborted = false
		}
	}()
	err, ok := value.(error)
	return ok && (errors.Is(err, syscall.EPIPE) ||
		errors.Is(err, syscall.ECONNRESET) || errors.Is(err, http.ErrAbortHandler))
}
