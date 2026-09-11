package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
)

// ParamInt64 is retained as a compatibility facade while controllers migrate into capability modules.
func ParamInt64(c *gin.Context, name string) (int64, bool) {
	return controllerutil.ParamInt64(c, name)
}

// ParamPositiveID is retained as a compatibility facade while controllers migrate into capability modules.
func ParamPositiveID(c *gin.Context, name string) (int64, bool) {
	return controllerutil.ParamPositiveID(c, name)
}

// WritePaginated is retained as a compatibility facade while controllers migrate into capability modules.
func WritePaginated(c *gin.Context, list any, total int, page, pageSize int) {
	controllerutil.WritePaginated(c, list, total, page, pageSize)
}

// FormatValidationError is retained as a compatibility facade while controllers migrate into capability modules.
func FormatValidationError(err error) string {
	return controllerutil.FormatValidationError(err)
}

// WriteValidationError is retained as a compatibility facade while controllers migrate into capability modules.
func WriteValidationError(c *gin.Context, err error) {
	controllerutil.WriteValidationError(c, err)
}

// WriteDomainError is retained as a compatibility facade while controllers migrate into capability modules.
func WriteDomainError(c *gin.Context, err error) {
	controllerutil.WriteDomainError(c, err)
}

// WriteServiceError is retained as a compatibility facade while controllers migrate into capability modules.
func WriteServiceError(c *gin.Context, err error) {
	controllerutil.WriteServiceError(c, err)
}
