package tool

import (
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"strings"
	"testing"
)

func TestRelatedQueryUsesTitleAndTagsAndStaysBounded(t *testing.T) {
	query := relatedQuery(&postdomain.Post{Title: "Blog automation", Tags: []string{" ai ", "operations", ""}})
	if query != "Blog automation ai operations" {
		t.Fatalf("query = %q", query)
	}
	long := relatedQuery(&postdomain.Post{Title: strings.Repeat("a", 501)})
	if len([]rune(long)) != 500 {
		t.Fatalf("long query length = %d", len([]rune(long)))
	}
}
