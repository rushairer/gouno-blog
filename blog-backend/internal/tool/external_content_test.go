package tool

import (
	"testing"
	"time"

	pagedomain "github.com/rushairer/blog-backend/internal/page/domain"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
)

func TestPublishedPostViewOmitsAdministrativeIdentityAndRevision(t *testing.T) {
	principalID := int64(42)
	now := time.Now()
	view := publishedPostView(&postdomain.Post{
		Revision: 9, ID: 7, Title: "Published", Slug: "published", Summary: "summary",
		Content: "body", Tags: []string{"go"}, Status: postdomain.PostStatusPublished,
		CreatedByPrincipalID: &principalID, UpdatedByPrincipalID: &principalID,
		ScheduledAt: &now, PublishedAt: &now, CreatedAt: now, UpdatedAt: now,
	})

	for _, forbidden := range []string{
		"revision",
		"created_by_principal_id",
		"updated_by_principal_id",
		"scheduled_at",
	} {
		if _, ok := view[forbidden]; ok {
			t.Fatalf("published external view leaked %q: %#v", forbidden, view)
		}
	}
	if view["id"] != int64(7) || view["content"] != "body" ||
		view["status"] != postdomain.PostStatusPublished {
		t.Fatalf("published external view = %#v", view)
	}
}

func TestPublishedPageViewContainsOnlyPublicPageFields(t *testing.T) {
	now := time.Now()
	view := publishedPageView(&pagedomain.Page{
		ID: 3, Title: "About", Slug: "about-us", Summary: "summary", Content: "body",
		Template: string(pagedomain.PageTemplateAbout), Status: pagedomain.PageStatusPublished,
		ShowInNav: true, AllowComments: false, SortOrder: 1,
		SEOTitle: "About", SEODescription: "About us", CreatedAt: now, UpdatedAt: now,
	})
	if view["id"] != int64(3) || view["slug"] != "about-us" || view["content"] != "body" {
		t.Fatalf("published page view = %#v", view)
	}
}
