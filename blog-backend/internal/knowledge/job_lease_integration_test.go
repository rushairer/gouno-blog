package knowledge

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/testsupport"
)

func TestClaimIndexJobRecoversAbandonedRunningLease(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	var postID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
		VALUES($1,$2,'summary','body','draft') RETURNING id`, "Index lease test "+suffix, "index-lease-test-"+suffix).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM ai_content_index_jobs WHERE post_id=$1`, postID); err != nil {
		t.Fatal(err)
	}

	var freshID, staleID, exhaustedID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_content_index_jobs
		(post_id,action,version_key,status,attempts,claimed_at) VALUES($1,'delete',$2,'running',1,NOW()) RETURNING id`, postID, "fresh-"+suffix).Scan(&freshID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_content_index_jobs
		(post_id,action,version_key,status,attempts,claimed_at) VALUES($1,'delete',$2,'running',1,NOW()-INTERVAL '20 minutes') RETURNING id`, postID, "stale-"+suffix).Scan(&staleID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_content_index_jobs
		(post_id,action,version_key,status,attempts,claimed_at) VALUES($1,'delete',$2,'running',5,NOW()-INTERVAL '20 minutes') RETURNING id`, postID, "exhausted-"+suffix).Scan(&exhaustedID); err != nil {
		t.Fatal(err)
	}

	svc := &Service{db: db}
	jobID, gotPostID, action, version, attempt, found, err := svc.claimIndexJob(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !found || jobID != staleID || gotPostID != postID || action != "delete" || version != "stale-"+suffix || attempt != 2 {
		t.Fatalf("claim = found:%v job:%d post:%d action:%q version:%q attempt:%d", found, jobID, gotPostID, action, version, attempt)
	}

	var status string
	var attempts int
	if err := db.QueryRowContext(ctx, `SELECT status,attempts FROM ai_content_index_jobs WHERE id=$1`, freshID).Scan(&status, &attempts); err != nil {
		t.Fatal(err)
	}
	if status != "running" || attempts != 1 {
		t.Fatalf("fresh lease changed: status=%q attempts=%d", status, attempts)
	}

	var errorCode string
	if err := db.QueryRowContext(ctx, `SELECT status,error_code FROM ai_content_index_jobs WHERE id=$1`, exhaustedID).Scan(&status, &errorCode); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || errorCode != "worker_lease_expired" {
		t.Fatalf("exhausted stale lease = status:%q error:%q", status, errorCode)
	}
}
