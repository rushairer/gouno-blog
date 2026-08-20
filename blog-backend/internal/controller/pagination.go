package controller

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	maxPage     = 10_000
	maxPageSize = 100
)

func normalizedPagination(page, pageSize, defaultSize int) (int, int) {
	if page < 1 || page > maxPage {
		page = 1
	}
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultSize
	}
	return page, pageSize
}

// ExtractPagination retrieves and normalizes page and pageSize from request query parameters,
// checking both pageSize and page_size aliases.
func ExtractPagination(c *gin.Context, defaultSize int) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSizeStr := c.Query("pageSize")
	if pageSizeStr == "" {
		pageSizeStr = c.Query("page_size")
	}
	pageSize, _ := strconv.Atoi(pageSizeStr)
	return normalizedPagination(page, pageSize, defaultSize)
}
