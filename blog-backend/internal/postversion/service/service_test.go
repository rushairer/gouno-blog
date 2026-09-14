package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	postversiondomain "github.com/rushairer/blog-backend/internal/postversion/domain"
)

type fakeVersionReader struct {
	versions []*postversiondomain.PostVersion
	err      error
	postID   int64
}

func (f *fakeVersionReader) ListVersions(_ context.Context, postID int64) ([]*postversiondomain.PostVersion, error) {
	f.postID = postID
	return f.versions, f.err
}

type fakeRestorer struct {
	restored  *domain.Post
	err       error
	postID    int64
	versionID int64
}

func (f *fakeRestorer) RestoreVersion(_ context.Context, postID, versionID int64) (*domain.Post, error) {
	f.postID = postID
	f.versionID = versionID
	return f.restored, f.err
}

func TestListVersionsValidatesPostID(t *testing.T) {
	svc := New(&fakeVersionReader{}, &fakeRestorer{})
	_, err := svc.ListVersions(context.Background(), 0)
	if !errors.Is(err, ErrInvalidPostID) {
		t.Fatalf("err=%v, want ErrInvalidPostID", err)
	}
}

func TestListVersionsDelegatesToRepository(t *testing.T) {
	reader := &fakeVersionReader{versions: []*postversiondomain.PostVersion{{ID: 7, PostID: 3}}}
	svc := New(reader, &fakeRestorer{})
	versions, err := svc.ListVersions(context.Background(), 3)
	if err != nil {
		t.Fatal(err)
	}
	if reader.postID != 3 || len(versions) != 1 || versions[0].ID != 7 {
		t.Fatalf("unexpected delegation: postID=%d versions=%#v", reader.postID, versions)
	}
}

func TestRestoreVersionValidatesIdentifiers(t *testing.T) {
	svc := New(&fakeVersionReader{}, &fakeRestorer{})
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
	svc := New(&fakeVersionReader{}, &fakeRestorer{err: sql.ErrNoRows})
	_, err := svc.RestoreVersion(context.Background(), 3, 9)
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("err=%v, want ErrPostNotFound", err)
	}
}

func TestRestoreVersionReturnsRestoredPost(t *testing.T) {
	restorer := &fakeRestorer{restored: &domain.Post{ID: 3, Title: "restored"}}
	svc := New(&fakeVersionReader{}, restorer)
	post, err := svc.RestoreVersion(context.Background(), 3, 9)
	if err != nil {
		t.Fatal(err)
	}
	if restorer.postID != 3 || restorer.versionID != 9 || post == nil || post.Title != "restored" {
		t.Fatalf("unexpected restore: postID=%d versionID=%d post=%#v", restorer.postID, restorer.versionID, post)
	}
}
