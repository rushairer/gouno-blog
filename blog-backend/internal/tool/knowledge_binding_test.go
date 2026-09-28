package tool

import (
	"context"
	"testing"

	"github.com/rushairer/blog-backend/internal/knowledge"
)

type fakeKnowledgeSearcher struct{}

func (fakeKnowledgeSearcher) Search(context.Context, string, int, int64) ([]knowledge.SearchResult, error) {
	return nil, nil
}

func TestBindKnowledgePromotesCapabilityToExternalSurface(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	if registry.SupportsSurface("content.search_knowledge", "external") {
		t.Fatal("knowledge search unexpectedly exposed before binding")
	}

	BindKnowledge(registry, fakeKnowledgeSearcher{})
	if !registry.SupportsSurface("content.search_knowledge", "external") {
		t.Fatal("knowledge search was not exposed after explicit binding")
	}
}
