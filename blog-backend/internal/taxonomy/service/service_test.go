package service

import (
	"context"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	taxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"
)

type stubRepository struct {
	created    *domain.Category
	updated    *domain.Category
	deletedID  int64
	renamedFrom string
	renamedTo   string
	deletedTag string
	mergedFrom string
	mergedTo   string
}

func (r *stubRepository) ListCategories(context.Context) ([]domain.Category, error) {
	return nil, nil
}

func (r *stubRepository) GetCategoryBySlug(context.Context, string) (*domain.Category, error) {
	return &domain.Category{ID: 7}, nil
}

func (r *stubRepository) ListCategoryPosts(context.Context, int64, int, int) ([]domain.Post, int, error) {
	return nil, 0, nil
}

func (r *stubRepository) CreateCategory(_ context.Context, item *domain.Category) error {
	r.created = item
	item.ID = 42
	return nil
}

func (r *stubRepository) UpdateCategory(_ context.Context, item *domain.Category) error {
	r.updated = item
	return nil
}

func (r *stubRepository) DeleteCategory(_ context.Context, id int64) error {
	r.deletedID = id
	return nil
}

func (r *stubRepository) ListPublishedTagSummaries(context.Context) ([]domain.TagSummary, error) {
	return nil, nil
}

func (r *stubRepository) ListAdminTags(context.Context) ([]domain.TagSummary, error) {
	return nil, nil
}

func (r *stubRepository) RenameTag(_ context.Context, oldName, newName string) error {
	r.renamedFrom, r.renamedTo = oldName, newName
	return nil
}

func (r *stubRepository) DeleteTag(_ context.Context, name string) error {
	r.deletedTag = name
	return nil
}

func (r *stubRepository) MergeTags(_ context.Context, source, target string) error {
	r.mergedFrom, r.mergedTo = source, target
	return nil
}

func TestCanonicalRepositoryErrorIdentity(t *testing.T) {
	if !errors.Is(ErrCategoryNotFound, taxonomyrepository.ErrCategoryNotFound) {
		t.Fatal("category not-found identity drifted from taxonomy repository")
	}
	if !errors.Is(ErrCategorySlugInUse, taxonomyrepository.ErrDuplicateSlug) {
		t.Fatal("duplicate slug identity drifted from taxonomy repository")
	}
}

func TestCreateCategoryNormalizesNameAndDelegates(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)

	item, err := svc.CreateCategory(context.Background(), &CategoryRequest{
		Name:        "  Product  ",
		Slug:        "product",
		Description: "desc",
		SortOrder:   3,
	})
	if err != nil {
		t.Fatalf("CreateCategory() error = %v", err)
	}
	if repo.created == nil || item != repo.created {
		t.Fatal("CreateCategory() did not delegate the canonical category instance")
	}
	if item.Name != "Product" || item.ID != 42 {
		t.Fatalf("CreateCategory() item = %#v", item)
	}
}

func TestCategoryValidation(t *testing.T) {
	svc := New(&stubRepository{})

	if _, err := svc.CreateCategory(context.Background(), &CategoryRequest{Name: " ", Slug: "valid"}); !errors.Is(err, ErrCategoryNameRequired) {
		t.Fatalf("CreateCategory() error = %v, want ErrCategoryNameRequired", err)
	}
	if _, err := svc.CreateCategory(context.Background(), &CategoryRequest{Name: "Name", Slug: "Not Valid"}); !errors.Is(err, ErrCategoryNameRequired) {
		t.Fatalf("CreateCategory() invalid slug error = %v, want ErrCategoryNameRequired", err)
	}
	if err := svc.UpdateCategory(context.Background(), 0, &CategoryRequest{Name: "Name", Slug: "name"}); !errors.Is(err, ErrInvalidCategoryID) {
		t.Fatalf("UpdateCategory() error = %v, want ErrInvalidCategoryID", err)
	}
	if err := svc.DeleteCategory(context.Background(), -1); !errors.Is(err, ErrInvalidCategoryID) {
		t.Fatalf("DeleteCategory() error = %v, want ErrInvalidCategoryID", err)
	}
}

func TestTagValidationAndNormalization(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)

	if err := svc.RenameTag(context.Background(), "old", "  new  "); err != nil {
		t.Fatalf("RenameTag() error = %v", err)
	}
	if repo.renamedFrom != "old" || repo.renamedTo != "new" {
		t.Fatalf("RenameTag() delegated (%q, %q)", repo.renamedFrom, repo.renamedTo)
	}
	if err := svc.RenameTag(context.Background(), " ", "new"); !errors.Is(err, ErrInvalidTagPayload) {
		t.Fatalf("RenameTag() invalid error = %v", err)
	}
	if err := svc.DeleteTag(context.Background(), " "); !errors.Is(err, ErrInvalidTagPayload) {
		t.Fatalf("DeleteTag() invalid error = %v", err)
	}
	if err := svc.MergeTags(context.Background(), "same", "same"); !errors.Is(err, ErrInvalidTagPayload) {
		t.Fatalf("MergeTags() invalid error = %v", err)
	}
}
