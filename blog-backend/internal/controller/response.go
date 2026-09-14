package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
)

// ParamPositiveID is retained only for Connector-held flat transport.
// Non-held capability controllers import controllerutil directly.
func ParamPositiveID(c *gin.Context, name string) (int64, bool) {
	return controllerutil.ParamPositiveID(c, name)
}

// WriteDomainError is retained only for the stable Access security boundary
// and Connector-held flat transport. Non-held capability controllers import
// controllerutil directly.
func WriteDomainError(c *gin.Context, err error) {
	controllerutil.WriteDomainError(c, err)
}
