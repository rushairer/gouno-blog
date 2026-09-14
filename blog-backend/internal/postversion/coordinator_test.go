package postversion

import (
	"context"
	"database/sql"
	"errors"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"testing"
	"time"

	postcapability "github.com/rushairer/blog-backend/internal/post"
	postversiondomain "github.com/rushairer/blog-backend/internal/postversion/domain"
)

type fakeTransactionRunner struct {
	err    error
	called bool
}

func (f *fakeTransactionRunner) Run(ctx context.Context, fn func(*sql.Tx) error) error {
	f.called = true
	if f.err != nil {
		return f.err
	}
	return fn(nil)
}

type fakeVersionSnapshotReader struct {
	version   *postversiondomain.PostVersion
	err       error
	postID    int64
	versionID int64
}

func (f *fakeVersionSnapshotReader) GetVersionTx(_ context.Context, _ *sql.Tx, postID, versionID int64) (*postversiondomain.PostVersion, error) {
	f.postID = postID
	f.versionID = versionID
	return f.version, f.err
}

type fakePostRestoreWriter struct {
	postID   int64
	snapshot postcapability.RestoreSnapshot
	result   *postdomain.Post
	err      error
	called   bool
}

func (f *fakePostRestoreWriter) RestoreSnapshotTx(_ context.Context, _ *sql.Tx, postID int64, snapshot postcapability.RestoreSnapshot) (*postdomain.Post, error) {
	f.called = true
	f.postID = postID
	f.snapshot = snapshot
	return f.result, f.err
}

func TestRestoreCoordinatorMapsVersionIntoPostOwnedCommand(t *testing.T) {
	now := time.Now().UTC()
	categoryID := int64(17)
	version := &postversiondomain.PostVersion{
		ID: 9, PostID: 3, Title: "old title", Slug: "old-slug", Summary: "old summary",
		Content: "old body", Tags: []string{"go", "architecture"}, CategoryID: &categoryID,
		CoverURL: "/cover.svg", CoverAlt: "cover", SEOTitle: "seo", SEODescription: "description",
		Status: postdomain.PostStatusPublished, PublishedAt: &now, ScheduledAt: &now,
	}
	runner := &fakeTransactionRunner{}
	versions := &fakeVersionSnapshotReader{version: version}
	posts := &fakePostRestoreWriter{result: &postdomain.Post{ID: 3, Title: "old title"}}
	coordinator := NewRestoreCoordinator(runner, versions, posts)

	restored, err := coordinator.RestoreVersion(context.Background(), 3, 9, 1)
	if err != nil {
		t.Fatal(err)
	}
	if !runner.called || versions.postID != 3 || versions.versionID != 9 || !posts.called || posts.postID != 3 {
		t.Fatalf("unexpected coordination: runner=%v version=(%d,%d) post=(%v,%d)", runner.called, versions.postID, versions.versionID, posts.called, posts.postID)
	}
	if posts.snapshot.Title != version.Title || posts.snapshot.Content != version.Content || posts.snapshot.CategoryID != version.CategoryID || posts.snapshot.SEOTitle != version.SEOTitle {
		t.Fatalf("snapshot mapping mismatch: %#v", posts.snapshot)
	}
	if restored == nil || restored.ID != 3 || restored.Title != "old title" {
		t.Fatalf("restored=%#v", restored)
	}
}

func TestRestoreCoordinatorStopsBeforePostWriteWhenSnapshotReadFails(t *testing.T) {
	want := errors.New("snapshot read failed")
	posts := &fakePostRestoreWriter{}
	coordinator := NewRestoreCoordinator(&fakeTransactionRunner{}, &fakeVersionSnapshotReader{err: want}, posts)
	_, err := coordinator.RestoreVersion(context.Background(), 3, 9, 1)
	if !errors.Is(err, want) || posts.called {
		t.Fatalf("err=%v postCalled=%v", err, posts.called)
	}
}
