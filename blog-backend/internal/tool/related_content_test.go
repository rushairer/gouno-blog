package tool

import (
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestRelatedQueryUsesTitleAndTagsAndStaysBounded(t *testing.T) {
	query := relatedQuery(&domain.Post{Title: "Blog automation", Tags: []string{" ai ", "operations", ""}})
	if query != "Blog automation ai operations" {
		t.Fatalf("query = %q", query)
	}
	long := relatedQuery(&domain.Post{Title: strings.Repeat("a", 501)})
	if len([]rune(long)) != 500 {
		t.Fatalf("long query length = %d", len([]rune(long)))
	}
}
