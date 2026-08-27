package access_test

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/domain"
)

func TestPostPolicy(t *testing.T) {
	authorActor := &access.Snapshot{
		Principal:        access.Principal{ID: 100},
		MembershipStatus: "active",
		Permissions:      []string{access.PermissionAuthorContent},
	}
	managerActor := &access.Snapshot{
		Principal:        access.Principal{ID: 200},
		MembershipStatus: "active",
		Permissions:      []string{access.PermissionManageContent, access.PermissionAuthorContent},
	}
	moderatorActor := &access.Snapshot{
		Principal:        access.Principal{ID: 300},
		MembershipStatus: "active",
		Permissions:      []string{access.PermissionModerate},
	}

	authorID := int64(100)
	otherID := int64(999)
	myPost := &domain.Post{ID: 1, Title: "My Post", CreatedByPrincipalID: &authorID}
	otherPost := &domain.Post{ID: 2, Title: "Other Post", CreatedByPrincipalID: &otherID}
	unownedPost := &domain.Post{ID: 3, Title: "Legacy Post", CreatedByPrincipalID: nil}

	policy := access.PostPolicy{}

	// Scope check (Both authors and managers can browse all items by default)
	authorFilter := domain.AdminPostFilter{}
	policy.ScopePosts(authorActor, &authorFilter)
	if authorFilter.CreatedByPrincipalID != nil {
		t.Fatalf("expected author filter to default to shared browse mode (nil CreatedByPrincipalID), got %#v", authorFilter.CreatedByPrincipalID)
	}

	managerFilter := domain.AdminPostFilter{}
	policy.ScopePosts(managerActor, &managerFilter)
	if managerFilter.CreatedByPrincipalID != nil {
		t.Fatalf("expected manager filter to have nil CreatedByPrincipalID, got %#v", managerFilter.CreatedByPrincipalID)
	}

	// CanView check (Visible to authors and managers)
	if allowed, _ := policy.CanView(authorActor, myPost); !allowed {
		t.Fatal("author should be allowed to view own post")
	}
	if allowed, _ := policy.CanView(authorActor, otherPost); !allowed {
		t.Fatal("author should be allowed to view other's post in read-only mode")
	}
	if allowed, _ := policy.CanView(authorActor, unownedPost); !allowed {
		t.Fatal("author should be allowed to view unowned/legacy post in read-only mode")
	}
	if allowed, _ := policy.CanView(managerActor, otherPost); !allowed {
		t.Fatal("manager should be allowed to view any post")
	}
	if allowed, _ := policy.CanView(managerActor, unownedPost); !allowed {
		t.Fatal("manager should be allowed to view unowned post")
	}
	if allowed, _ := policy.CanView(moderatorActor, myPost); allowed {
		t.Fatal("moderator should NOT be allowed to view post in admin")
	}

	// CanEdit check
	if allowed, _ := policy.CanEdit(authorActor, myPost); !allowed {
		t.Fatal("author should be allowed to edit own post")
	}
	if allowed, _ := policy.CanEdit(authorActor, otherPost); allowed {
		t.Fatal("author should NOT be allowed to edit other's post")
	}
	if allowed, _ := policy.CanEdit(authorActor, unownedPost); allowed {
		t.Fatal("author should NOT be allowed to edit unowned/legacy post")
	}
	if allowed, _ := policy.CanEdit(managerActor, otherPost); !allowed {
		t.Fatal("manager should be allowed to edit any post")
	}
	if allowed, _ := policy.CanEdit(managerActor, unownedPost); !allowed {
		t.Fatal("manager should be allowed to edit unowned post")
	}

	// CanDelete check
	if allowed, _ := policy.CanDelete(authorActor, myPost); allowed {
		t.Fatal("author should NOT be allowed to delete post")
	}
	if allowed, _ := policy.CanDelete(managerActor, myPost); !allowed {
		t.Fatal("manager should be allowed to delete post")
	}
}

func TestMediaPolicy(t *testing.T) {
	authorActor := &access.Snapshot{
		Principal:        access.Principal{ID: 100},
		MembershipStatus: "active",
		Permissions:      []string{access.PermissionAuthorContent},
	}
	managerActor := &access.Snapshot{
		Principal:        access.Principal{ID: 200},
		MembershipStatus: "active",
		Permissions:      []string{access.PermissionManageContent, access.PermissionAuthorContent},
	}

	authorID := int64(100)
	otherID := int64(999)
	myMedia := &domain.MediaAsset{ID: 10, Filename: "mine.png", CreatedByPrincipalID: &authorID}
	otherMedia := &domain.MediaAsset{ID: 20, Filename: "other.png", CreatedByPrincipalID: &otherID}
	unownedMedia := &domain.MediaAsset{ID: 30, Filename: "unowned.png", CreatedByPrincipalID: nil}

	policy := access.MediaPolicy{}

	// Scope check (Both authors and managers can browse all media by default)
	authorFilter := domain.MediaFilter{}
	policy.ScopeMedia(authorActor, &authorFilter)
	if authorFilter.CreatedByPrincipalID != nil {
		t.Fatalf("expected author media filter to default to shared browse mode (nil CreatedByPrincipalID), got %#v", authorFilter.CreatedByPrincipalID)
	}

	managerFilter := domain.MediaFilter{}
	policy.ScopeMedia(managerActor, &managerFilter)
	if managerFilter.CreatedByPrincipalID != nil {
		t.Fatalf("expected manager media filter to have nil CreatedByPrincipalID, got %#v", managerFilter.CreatedByPrincipalID)
	}

	// CanView check
	if allowed, _ := policy.CanView(authorActor, myMedia); !allowed {
		t.Fatal("author should be allowed to view own media")
	}
	if allowed, _ := policy.CanView(authorActor, otherMedia); !allowed {
		t.Fatal("author should be allowed to view other's media for insertion")
	}
	if allowed, _ := policy.CanView(authorActor, unownedMedia); !allowed {
		t.Fatal("author should be allowed to view unowned media")
	}

	// CanDelete check
	// 1. My media with 0 references
	if allowed, _ := policy.CanDelete(authorActor, myMedia, 0); !allowed {
		t.Fatal("author should be allowed to delete own unreferenced media")
	}
	// 2. My media with > 0 references
	if allowed, _ := policy.CanDelete(authorActor, myMedia, 2); allowed {
		t.Fatal("author should NOT be allowed to delete referenced media")
	}
	// 3. Other's media with 0 references
	if allowed, _ := policy.CanDelete(authorActor, otherMedia, 0); allowed {
		t.Fatal("author should NOT be allowed to delete other's media")
	}
	// 4. Unowned media with 0 references by author
	if allowed, _ := policy.CanDelete(authorActor, unownedMedia, 0); allowed {
		t.Fatal("author should NOT be allowed to delete unowned media")
	}
	// 5. Manager deleting other's media with 0 references
	if allowed, _ := policy.CanDelete(managerActor, otherMedia, 0); !allowed {
		t.Fatal("manager should be allowed to delete unreferenced media")
	}
	// 6. Manager deleting media with > 0 references
	if allowed, _ := policy.CanDelete(managerActor, otherMedia, 1); allowed {
		t.Fatal("manager should NOT be allowed to delete referenced media")
	}
}
