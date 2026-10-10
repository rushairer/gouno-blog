package service_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestPostOptionalTagsAreEmptyArrayInRegularAndApprovalTransactions(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	repo := postrepository.NewPostRepository(db)
	svc := postservice.NewPostService(repo)
	ctx := context.Background()
	for _, tc := range []struct {
		name string
		transaction bool
	}{
		{"regular PostService", false},
		{"approval transaction", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := &postdomain.Post{
				Title: "Optional labels",
				Slug: fmt.Sprintf("optional-tags-%d", time.Now().UnixNano()),
				Content: "body",
				Status: postdomain.PostStatusDraft,
			}
			if tc.transaction {
				tx, err := db.BeginTx(ctx, &sql.TxOptions{})
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback()
				if err := svc.CreatePostTx(ctx, tx, p); err != nil {
					t.Fatal(err)
				}
				if err := tx.Commit(); err != nil {
					t.Fatal(err)
				}
			} else if err := svc.CreatePost(ctx, p); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = repo.Delete(context.Background(), p.ID) })
			var tagCount int
			var tagsAreNull bool
			if err := db.QueryRowContext(ctx,
				`SELECT cardinality(tags), tags IS NULL FROM posts WHERE id=$1`, p.ID).
				Scan(&tagCount, &tagsAreNull); err != nil {
				t.Fatal(err)
			}
			if tagsAreNull || tagCount != 0 || p.Tags == nil {
				t.Fatalf("optional tags not canonicalized: tags=%#v count=%d null=%t", p.Tags, tagCount, tagsAreNull)
			}
		})
	}
}
