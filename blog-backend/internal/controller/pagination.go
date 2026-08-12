package controller

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
