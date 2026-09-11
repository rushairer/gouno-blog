package controllerutil

import "testing"

func TestNormalizePaginationBoundsPageAndPageSize(t *testing.T) {
	page, size := NormalizePagination(-9, 100_000, 20)
	if page != 1 || size != 20 {
		t.Fatalf("page=%d size=%d, want 1 and 20", page, size)
	}

	page, size = NormalizePagination(3, 100, 20)
	if page != 3 || size != 100 {
		t.Fatalf("page=%d size=%d, want 3 and 100", page, size)
	}

	page, _ = NormalizePagination(maxPage+1, 20, 20)
	if page != 1 {
		t.Fatalf("oversized page=%d, want 1", page)
	}
}
