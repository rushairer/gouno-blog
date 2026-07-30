package tool

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestAuditPostReportsDeterministicMetadataAndMarkdownIssues(t *testing.T) {
	result := auditPost(&domain.Post{
		ID: 7, Title: "A very useful article", Content: "## Start\n\n![ ](/image.png)\n\n[External](https://example.com) [Internal](/posts/other)\n\n#### Skipped heading",
		CoverURL: "https://cdn.example.com/cover.png",
	})
	metrics := result["metrics"].(map[string]int)
	if metrics["image_count"] != 1 || metrics["images_missing_alt"] != 1 || metrics["external_link_count"] != 1 || metrics["internal_link_count"] != 1 {
		t.Fatalf("unexpected metrics: %#v", metrics)
	}
	checks := result["checks"].([]contentAuditCheck)
	want := map[string]bool{
		"summary_missing": false, "seo_title_missing": false, "seo_description_missing": false,
		"cover_alt_missing": false, "image_alt_missing": false, "heading_level_skipped": false,
	}
	for _, check := range checks {
		if _, ok := want[check.Code]; ok {
			want[check.Code] = true
		}
	}
	for code, found := range want {
		if !found {
			t.Errorf("expected %s check, got %#v", code, checks)
		}
	}
}

func TestAuditPostDoesNotReportCompliantMetadataIssues(t *testing.T) {
	result := auditPost(&domain.Post{
		ID: 8, Title: "Useful article", Summary: "A helpful summary.",
		SEOTitle: "Useful article", SEODescription: "A concise search description.",
		CoverURL: "https://cdn.example.com/cover.png", CoverAlt: "An illustrative cover",
		Content: "## Introduction\n\n" + string(make([]byte, 0)),
	})
	checks := result["checks"].([]contentAuditCheck)
	for _, check := range checks {
		if check.Code == "summary_missing" || check.Code == "seo_title_missing" || check.Code == "seo_description_missing" || check.Code == "cover_alt_missing" {
			t.Fatalf("unexpected check %#v", check)
		}
	}
}
