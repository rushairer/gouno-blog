package controller

const maxPageSize = 100

func normalizedPagination(page, pageSize, defaultSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultSize
	}
	return page, pageSize
}
