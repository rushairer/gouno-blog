package repository

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestPostRevisionConcurrentWritesAndCounters(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	repo := NewPostRepository(db)
	p := &postdomain.Post{Title: "initial", Slug: fmt.Sprintf("revision-%d", time.Now().UnixNano()), Content: "body", Tags: []string{}, Status: postdomain.PostStatusDraft}
	if err := repo.Create(ctx, p); err != nil {
		t.Fatal(err)
	}
	defer repo.Delete(ctx, p.ID)
	if p.Revision != 1 {
		t.Fatalf("initial revision=%d", p.Revision)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			copy := *p
			copy.Title = fmt.Sprint("writer", i)
			<-start
			results <- repo.Update(ctx, &copy)
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for err := range results {
		if err == nil {
			successes++
		} else if errors.Is(err, postdomain.ErrRevisionConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflict=%d", successes, conflicts)
	}
	latest, err := repo.GetByID(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if latest.Revision != 2 {
		t.Fatalf("revision=%d", latest.Revision)
	}
	if err := repo.IncrementViews(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.IncrementLikes(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	latest.Title = "next"
	if err := repo.Update(ctx, latest); err != nil {
		t.Fatal(err)
	}
	if latest.Revision != 3 {
		t.Fatalf("counter update changed revision: %d", latest.Revision)
	}
	var versions int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM post_versions WHERE post_id=$1`, p.ID).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if versions != 2 {
		t.Fatalf("conflict left a snapshot: %d", versions)
	}
	// Indirect taxonomy SQL participates in the same revision contract.
	if _, err := db.ExecContext(ctx, `UPDATE posts SET tags=ARRAY['renamed'] WHERE id=$1`, p.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.Update(ctx, latest); !errors.Is(err, postdomain.ErrRevisionConflict) {
		t.Fatalf("stale after taxonomy: %v", err)
	}
}

func TestPostRevisionBatchAllOrNothingAndScheduling(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	repo := NewPostRepository(db)
	ids := []int64{}
	expected := map[int64]int64{}
	for i := 0; i < 2; i++ {
		p := &postdomain.Post{Title: "batch", Slug: fmt.Sprintf("revision-batch-%d-%d", time.Now().UnixNano(), i), Content: "body", Tags: []string{}, Status: postdomain.PostStatusDraft}
		if err := repo.Create(ctx, p); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, p.ID)
		expected[p.ID] = p.Revision
		defer repo.Delete(ctx, p.ID)
	}
	expected[ids[1]] = 2
	if _, err := repo.Batch(ctx, ids, "publish", expected); !errors.Is(err, postdomain.ErrRevisionConflict) {
		t.Fatalf("batch conflict=%v", err)
	}
	for _, id := range ids {
		p, err := repo.GetByID(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if p.Revision != 1 || p.Status != postdomain.PostStatusDraft {
			t.Fatal("partial batch write")
		}
	}
	expected[ids[1]] = 1
	if n, err := repo.Batch(ctx, ids, "publish", expected); err != nil || n != 2 {
		t.Fatalf("batch=%d %v", n, err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE posts SET status='scheduled', scheduled_at=NOW()-INTERVAL '1 second' WHERE id=$1`, ids[0]); err != nil {
		t.Fatal(err)
	}
	before, err := repo.GetByID(ctx, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.PublishScheduled(ctx); err != nil {
		t.Fatal(err)
	}
	after, err := repo.GetByID(ctx, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if after.Revision != before.Revision+1 || after.Status != postdomain.PostStatusPublished {
		t.Fatal("scheduler revision mismatch")
	}
}
