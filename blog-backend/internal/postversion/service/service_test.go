package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type fakeRepository struct {
	versions   []*domain.PostVersion
	restored   *domain.Post
	listErr    error
	restoreErr error
	postID     int64
	versionID  int64
}

func (f *fakeRepository) ListVersions(_ context.Context, postID int64) ([]*domain.PostVersion, error) {
	f.postID = postID
	return f.versions, f.listErr
}

func (f *fakeRepository) RestoreVersion(_ context.Context, postID, versionID int64) (*domain.Post, error) {
	f.postID = postID
	f.versionID = versionID
	return f.restored, f.restoreErr
}

func TestListVersionsValidatesPostID(t *testing.T) {
	svc := New(&fakeRepository{})
	_, err := svc.ListVersions(context.Background(), 0)
	if !errors.Is(err, ErrInvalidPostID) {
		t.Fatalf("err=%v, want ErrInvalidPostID", err)
	}
}

func TestListVersionsDelegatesToRepository(t *testing.T) {
	repo := &fakeRepository{versions: []*domain.PostVersion{{ID: 7, PostID: 3}}}
	svc := New(repo)
	versions, err := svc.ListVersions(context.Background(), 3)
	if err != nil {
		t.Fatal(err)
	}
	if repo.postID != 3 || len(versions) != 1 || versions[0].ID != 7 {
		t.Fatalf("unexpected delegation: postID=%d versions=%#v", repo.postID, versions)
	}
}

func TestRestoreVersionValidatesIdentifiers(t *testing.T) {
	svc := New(&fakeRepository{})
	for _, tc := range []struct {
		postID    int64
		versionID int64
	}{{0, 1}, {1, 0}, {-1, 2}} {
		_, err := svc.RestoreVersion(context.Background(), tc.postID, tc.versionID)
		if !errors.Is(err, ErrInvalidVersion) {
			t.Fatalf("RestoreVersion(%d,%d) err=%v, want ErrInvalidVersion", tc.postID, tc.versionID, err)
		}
	}
}

func TestRestoreVersionMapsMissingSnapshotToPostNotFound(t *testing.T) {
	svc := New(&fakeRepository{restoreErr: sql.ErrNoRows})
	_, err := svc.RestoreVersion(context.Background(), 3, 9)
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("err=%v, want ErrPostNotFound", err)
	}
}

func TestRestoreVersionReturnsRestoredPost(t *testing.T) {
	repo := &fakeRepository{restored: &domain.Post{ID: 3, Title: "restored"}}
	svc := New(repo)
	post, err := svc.RestoreVersion(context.Background(), 3, 9)
	if err != nil {
		t.Fatal(err)
	}
	if repo.postID != 3 || repo.versionID != 9 || post == nil || post.Title != "restored" {
		t.Fatalf("unexpected restore: postID=%d versionID=%d post=%#v", repo.postID, repo.versionID, post)
	}
}
