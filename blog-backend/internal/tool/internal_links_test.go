package tool

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestRankInternalLinkCandidatesPrioritizesEvidenceAndExcludesExistingLinks(t *testing.T) {
	source := &domain.Post{
		ID: 1, Title: "Build a Go API", Tags: []string{"go", "backend"},
		Content: "This guide uses Go and explains authentication. [Already linked](/articles/auth-guide)",
	}
	candidates := []*domain.Post{
		{ID: 2, Title: "Go testing guide", Slug: "go-testing", Summary: "Tests", Tags: []string{"go"}},
		{ID: 3, Title: "Authentication guide", Slug: "auth-guide", Summary: "Auth", Tags: []string{"backend"}},
		{ID: 4, Title: "Gardening notes", Slug: "garden", Tags: []string{"life"}},
	}
	got := rankInternalLinkCandidates(source, candidates, 5)
	if len(got) != 1 || got[0].Slug != "go-testing" || got[0].Score < 4 {
		t.Fatalf("suggestions = %#v", got)
	}
	if len(got[0].MatchHints) == 0 || got[0].MatchHints[0] != "shared tag: go" {
		t.Fatalf("missing score evidence: %#v", got[0])
	}
}

func TestLinkedSlugsSupportsLegacyAndCurrentArticlePaths(t *testing.T) {
	got := linkedSlugs("[Current](/articles/current) [Legacy](/posts/legacy) [External](https://example.com/articles/not-local)")
	if len(got) != 2 {
		t.Fatalf("linked slugs = %#v", got)
	}
	for _, slug := range []string{"current", "legacy"} {
		if _, ok := got[slug]; !ok {
			t.Fatalf("expected %q in %#v", slug, got)
		}
	}
}
