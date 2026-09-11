package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/controllerutil"
)

const maxPage = 10_000

func normalizedPagination(page, pageSize, defaultSize int) (int, int) {
	return controllerutil.NormalizePagination(page, pageSize, defaultSize)
}

// ExtractPagination is retained as a compatibility facade while controllers migrate into capability modules.
func ExtractPagination(c *gin.Context, defaultSize int) (int, int) {
	return controllerutil.ExtractPagination(c, defaultSize)
}
