package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
)

type stubRepository struct {
	created    *domain.MediaAsset
	createErr  error
	got        *domain.MediaAsset
	getErr     error
	listed     []*domain.MediaAsset
	listErr    error
	updated    *domain.MediaAsset
	updateErr  error
	updatedAlt string
	updatedBy  *int64
	deleted    *domain.MediaAsset
	deleteErr  error
	count      int64
	countErr   error
	refs       []*domain.MediaReference
	refsErr    error
}

func (r *stubRepository) CreateMedia(_ context.Context, asset *domain.MediaAsset) error {
	r.created = asset
	return r.createErr
}

func (r *stubRepository) GetMedia(_ context.Context, _ int64) (*domain.MediaAsset, error) {
	return r.got, r.getErr
}

func (r *stubRepository) ListMedia(_ context.Context, _ domain.MediaFilter) ([]*domain.MediaAsset, error) {
	return r.listed, r.listErr
}

func (r *stubRepository) UpdateMediaAltText(_ context.Context, _ int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	r.updatedAlt = altText
	r.updatedBy = updatedByPrincipalID
	return r.updated, r.updateErr
}

func (r *stubRepository) DeleteMedia(_ context.Context, _ int64) (*domain.MediaAsset, error) {
	return r.deleted, r.deleteErr
}

func (r *stubRepository) CountMediaReferences(_ context.Context, _ int64) (int64, error) {
	return r.count, r.countErr
}

func (r *stubRepository) ListMediaReferences(_ context.Context, _ int64) ([]*domain.MediaReference, error) {
	return r.refs, r.refsErr
}

func TestServiceValidatesMediaInput(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)
	ctx := context.Background()

	for _, asset := range []*domain.MediaAsset{
		nil,
		{Filename: " ", StorageName: "asset.png"},
		{Filename: "asset.png", StorageName: " "},
	} {
		if err := svc.CreateMedia(ctx, asset); !errors.Is(err, ErrInvalidMediaPayload) {
			t.Fatalf("CreateMedia(%#v) error=%v, want ErrInvalidMediaPayload", asset, err)
		}
	}

	valid := &domain.MediaAsset{Filename: "asset.png", StorageName: "stored.png"}
	if err := svc.CreateMedia(ctx, valid); err != nil {
		t.Fatalf("CreateMedia(valid) error=%v", err)
	}
	if repo.created != valid {
		t.Fatal("CreateMedia did not delegate the original asset")
	}

	if _, err := svc.GetMedia(ctx, 0); !errors.Is(err, ErrInvalidMediaID) {
		t.Fatalf("GetMedia invalid id error=%v", err)
	}
	if _, err := svc.UpdateMedia(ctx, -1, "alt", nil); !errors.Is(err, ErrInvalidMediaID) {
		t.Fatalf("UpdateMedia invalid id error=%v", err)
	}
	if _, err := svc.DeleteMedia(ctx, 0); !errors.Is(err, ErrInvalidMediaID) {
		t.Fatalf("DeleteMedia invalid id error=%v", err)
	}
	if _, err := svc.CountMediaReferences(ctx, 0); !errors.Is(err, ErrInvalidMediaID) {
		t.Fatalf("CountMediaReferences invalid id error=%v", err)
	}
	if _, err := svc.ListMediaReferences(ctx, 0); !errors.Is(err, ErrInvalidMediaID) {
		t.Fatalf("ListMediaReferences invalid id error=%v", err)
	}
}

func TestServiceMapsNotFoundAndTrimsAltText(t *testing.T) {
	ctx := context.Background()

	for name, call := range map[string]func(Service) error{
		"get": func(svc Service) error {
			_, err := svc.GetMedia(ctx, 7)
			return err
		},
		"update": func(svc Service) error {
			_, err := svc.UpdateMedia(ctx, 7, "alt", nil)
			return err
		},
		"delete": func(svc Service) error {
			_, err := svc.DeleteMedia(ctx, 7)
			return err
		},
	} {
		t.Run(name, func(t *testing.T) {
			repo := &stubRepository{}
			switch name {
			case "get":
				repo.getErr = sql.ErrNoRows
			case "update":
				repo.updateErr = sql.ErrNoRows
			case "delete":
				repo.deleteErr = sql.ErrNoRows
			}
			if err := call(New(repo)); !errors.Is(err, ErrMediaNotFound) {
				t.Fatalf("error=%v, want ErrMediaNotFound", err)
			}
		})
	}

	principalID := int64(42)
	repo := &stubRepository{updated: &domain.MediaAsset{ID: 7}}
	updated, err := New(repo).UpdateMedia(ctx, 7, "  descriptive alt  ", &principalID)
	if err != nil || updated == nil || updated.ID != 7 {
		t.Fatalf("UpdateMedia result=%#v err=%v", updated, err)
	}
	if repo.updatedAlt != "descriptive alt" {
		t.Fatalf("alt text=%q, want trimmed value", repo.updatedAlt)
	}
	if repo.updatedBy == nil || *repo.updatedBy != principalID {
		t.Fatalf("updated principal=%v, want %d", repo.updatedBy, principalID)
	}
}

func TestServiceDelegatesCollectionsAndReferences(t *testing.T) {
	ctx := context.Background()
	assets := []*domain.MediaAsset{{ID: 1}, {ID: 2}}
	refs := []*domain.MediaReference{{PostID: 9, PostTitle: "Referenced", PostSlug: "referenced"}}
	repo := &stubRepository{listed: assets, count: 1, refs: refs}
	svc := New(repo)

	listed, err := svc.ListMedia(ctx, domain.MediaFilter{})
	if err != nil || len(listed) != 2 || listed[1].ID != 2 {
		t.Fatalf("ListMedia=%#v err=%v", listed, err)
	}
	count, err := svc.CountMediaReferences(ctx, 3)
	if err != nil || count != 1 {
		t.Fatalf("CountMediaReferences=%d err=%v", count, err)
	}
	gotRefs, err := svc.ListMediaReferences(ctx, 3)
	if err != nil || len(gotRefs) != 1 || gotRefs[0].PostID != 9 {
		t.Fatalf("ListMediaReferences=%#v err=%v", gotRefs, err)
	}
}

func TestServicePreservesMediaInUseIdentity(t *testing.T) {
	if ErrMediaInUse != mediarepository.ErrMediaInUse {
		t.Fatal("ErrMediaInUse must alias the repository sentinel")
	}
	repo := &stubRepository{deleteErr: mediarepository.ErrMediaInUse}
	_, err := New(repo).DeleteMedia(context.Background(), 5)
	if !errors.Is(err, ErrMediaInUse) {
		t.Fatalf("DeleteMedia error=%v, want ErrMediaInUse", err)
	}
}
