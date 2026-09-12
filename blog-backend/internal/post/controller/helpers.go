package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
)

func ExtractPagination(c *gin.Context, defaultPageSize int) (int, int) {
	return controllerutil.ExtractPagination(c, defaultPageSize)
}

func WritePaginated(c *gin.Context, list any, total int, page, pageSize int) {
	controllerutil.WritePaginated(c, list, total, page, pageSize)
}

func WriteValidationError(c *gin.Context, err error) {
	controllerutil.WriteValidationError(c, err)
}

func WriteDomainError(c *gin.Context, err error) {
	controllerutil.WriteDomainError(c, err)
}
