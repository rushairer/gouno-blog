package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/migrations"
)

func communityTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Up(context.Background(), db); err != nil {
		db.Close()
		t.Fatal(err)
	}
	return db
}

func TestCommunityRepositoryInteractionOwnershipAndUniqueness(t *testing.T) {
	db := communityTestDB(t)
	defer db.Close()
	ctx := context.Background()
	slug := fmt.Sprintf("community-integration-%d", time.Now().UnixNano())
	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts (title, slug, summary, content, status, published_at)
		VALUES ('Community integration', $1, '', 'Body', 'published', NOW()) RETURNING id`, slug).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(ctx, `DELETE FROM posts WHERE id = $1`, postID)
	repo := NewCommunityRepository(db)

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := repo.SetLike(ctx, postID, "user:reader", true)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	state, err := repo.CommunityState(ctx, postID, "user:reader", "reader")
	if err != nil {
		t.Fatal(err)
	}
	if !state.Liked || state.LikesCount != 1 {
		t.Fatalf("concurrent like was not idempotent: %#v", state)
	}

	parentPrincipalID := int64(1)
	parent := &domain.Comment{
		PostID: postID, Author: "Parent", AuthorPrincipalID: &parentPrincipalID, AuthorType: "user",
		Content: "Parent comment", Status: "visible", IsVisible: true,
	}
	if err := repo.CreateComment(ctx, parent); err != nil {
		t.Fatal(err)
	}
	replyPrincipalID := int64(2)
	reply := &domain.Comment{
		PostID: postID, ParentID: &parent.ID, Author: "Reply", AuthorPrincipalID: &replyPrincipalID,
		AuthorType: "user", Content: "Reply comment", Status: "visible", IsVisible: true,
	}
	if err := repo.CreateComment(ctx, reply); err != nil {
		t.Fatal(err)
	}
	parentNotifications, unread, err := repo.ListNotifications(ctx, 1, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	otherNotifications, _, _ := repo.ListNotifications(ctx, 2, 10, 0)
	if len(parentNotifications) != 1 || unread != 1 || len(otherNotifications) != 0 {
		t.Fatalf("notification ownership mismatch: parent=%d unread=%d other=%d", len(parentNotifications), unread, len(otherNotifications))
	}
	if err := repo.ReadNotification(ctx, 2, parentNotifications[0].ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("another subject should not read the notification, got %v", err)
	}
	if err := repo.ModerateComment(ctx, reply.ID, "hidden"); err != nil {
		t.Fatal(err)
	}
	if err := repo.ModerateComment(ctx, reply.ID, "visible"); err != nil {
		t.Fatal(err)
	}
	parentNotifications, _, _ = repo.ListNotifications(ctx, 1, 10, 0)
	if len(parentNotifications) != 1 {
		t.Fatalf("re-approving a reply created a duplicate notification: %d", len(parentNotifications))
	}

	if err := repo.ReportComment(ctx, parent.ID, "anon:visitor", "spam"); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReportComment(ctx, parent.ID, "anon:visitor", "spam"); !errors.Is(err, ErrDuplicateInteraction) {
		t.Fatalf("expected duplicate report rejection, got %v", err)
	}
}
