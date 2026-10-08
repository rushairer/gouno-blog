package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/operations"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

type atomicApprovalFixture struct {
	db         *sql.DB
	repo       *agentrepository.ApprovalRepository
	transactor *dbtx.Transactor
	effects    *operations.Service
	approvalID int64
	principal  int64
	action     string
}

func newAtomicApprovalFixture(t *testing.T, action string) *atomicApprovalFixture {
	t.Helper()
	db := testsupport.OpenTestDB(t)
	ctx := context.Background()
	fixture := &atomicApprovalFixture{db: db, repo: agentrepository.NewApprovalRepository(db), transactor: dbtx.NewTransactor(db, nil), action: action}
	fixture.effects = operations.NewService(db, nil, nil, fixture.transactor)

	var agentID, runID, toolCallID, postID, commentID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE deleted_at IS NULL ORDER BY id LIMIT 1`).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id,trigger_type,status,input,provider,model,skill_version_id)
		VALUES($1,'manual','awaiting_approval','{}','openai','test-model',(SELECT skill_version_id FROM ai_agents WHERE id=$1))
		RETURNING id`, agentID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_editorial_tasks WHERE source_approval_id=$1`, fixture.approvalID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_comment_reply_drafts WHERE source_approval_id=$1`, fixture.approvalID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_agent_runs WHERE id=$1`, runID)
		if postID != 0 {
			_, _ = db.ExecContext(context.Background(), `DELETE FROM posts WHERE id=$1`, postID)
		}
		_ = db.Close()
	})
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,$2,'propose','{}','executed') RETURNING id`, runID, action).Scan(&toolCallID); err != nil {
		t.Fatal(err)
	}

	var payload json.RawMessage
	targetType := "task"
	switch action {
	case "create_editorial_task":
		payload = json.RawMessage(`{"title":"Atomic review","description":"Review before publish","priority":"high"}`)
	case "reply_comment":
		suffix := fmt.Sprintf("%d", time.Now().UnixNano())
		if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
			VALUES($1,$2,'summary','body','draft') RETURNING id`, "Atomic approval "+suffix, "atomic-approval-"+suffix).Scan(&postID); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRowContext(ctx, `INSERT INTO comments(post_id,author,author_type,content,status,is_visible)
			VALUES($1,'Fixture','anonymous','Comment to reply','pending',FALSE) RETURNING id`, postID).Scan(&commentID); err != nil {
			t.Fatal(err)
		}
		payload = json.RawMessage(fmt.Sprintf(`{"comment_id":%d,"content":"Atomic reply"}`, commentID))
		targetType = "comment"
	default:
		t.Fatalf("unsupported test approval action %q", action)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,proposed_payload,status)
		VALUES($1,$2,$3,$4,$5::jsonb,'pending') RETURNING id`,
		runID, toolCallID, action, targetType, string(payload)).Scan(&fixture.approvalID); err != nil {
		t.Fatal(err)
	}
	fixture.principal = testsupport.Principal(t, db)
	return fixture
}

func (f *atomicApprovalFixture) service(store ApprovalStore, runner ApprovalTransactionRunner) *ApprovalService {
	return &ApprovalService{approvals: store, effects: f.effects, transactor: runner}
}

func (f *atomicApprovalFixture) status(t *testing.T) domain.ApprovalStatus {
	t.Helper()
	approval, err := f.repo.GetApproval(context.Background(), f.approvalID)
	if err != nil {
		t.Fatal(err)
	}
	return approval.Status
}

func (f *atomicApprovalFixture) effectCount(t *testing.T) int {
	t.Helper()
	var count int
	query := `SELECT COUNT(*) FROM ai_editorial_tasks WHERE source_approval_id=$1`
	if f.action == "reply_comment" {
		query = `SELECT COUNT(*) FROM ai_comment_reply_drafts WHERE source_approval_id=$1`
	}
	if err := f.db.QueryRowContext(context.Background(), query, f.approvalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestAtomicOperationsApprovalCommitsEffectAndStatus(t *testing.T) {
	for _, action := range []string{"create_editorial_task", "reply_comment"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(f.repo, f.transactor)
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "approved"); err != nil {
				t.Fatal(err)
			}
			if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 1 {
				t.Fatalf("committed approval status=%s effect count=%d", f.status(t), f.effectCount(t))
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("duplicate approval error=%v, want conflict", err)
			}
			if f.effectCount(t) != 1 {
				t.Fatal("duplicate effect created")
			}
		})
	}
}

type rollbackApprovalStatusStore struct {
	*agentrepository.ApprovalRepository
}

func (s *rollbackApprovalStatusStore) CompleteApprovalTx(context.Context, *sql.Tx, int64, domain.ApprovalStatus, string) error {
	return errors.New("injected: completion failed after Operations insert")
}

func TestAtomicOperationsApprovalRollsBackSideEffectIfStatusFails(t *testing.T) {
	for _, action := range []string{"create_editorial_task", "reply_comment"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(&rollbackApprovalStatusStore{ApprovalRepository: f.repo}, f.transactor)
			err := svc.Approve(context.Background(), f.approvalID, f.principal, "approved")
			if !errors.Is(err, ErrApprovalOutcomeUncertain) {
				t.Fatalf("error=%v, want uncertain execution", err)
			}
			if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
				t.Fatalf("rollback was partial: status=%s rows=%d", f.status(t), f.effectCount(t))
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("unsafe retry after rollback: %v", err)
			}
		})
	}
}

type lostCommitReplyTransactor struct {
	real *dbtx.Transactor
}

func (t lostCommitReplyTransactor) Run(ctx context.Context, callback func(*sql.Tx) error) error {
	if err := t.real.Run(ctx, callback); err != nil {
		return err
	}
	return errors.New("injected: commit succeeded but acknowledgement lost")
}

func TestAtomicOperationsApprovalCommitAckLossKeepsOneEffectAndExecutedStatus(t *testing.T) {
	for _, action := range []string{"create_editorial_task", "reply_comment"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(f.repo, lostCommitReplyTransactor{real: f.transactor})
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "approved"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
				t.Fatalf("error=%v, want uncertain result", err)
			}
			if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 1 {
				t.Fatalf("post-commit state= %s / %d effects", f.status(t), f.effectCount(t))
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("unsafe replay after committed acknowledgement loss: %v", err)
			}
		})
	}
}

func TestAtomicOperationsApprovalConcurrentReviewers(t *testing.T) {
	for _, action := range []string{"create_editorial_task", "reply_comment"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(f.repo, f.transactor)
			const workers = 16
			var wg sync.WaitGroup
			results := make(chan error, workers)
			for range workers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					results <- svc.Approve(context.Background(), f.approvalID, f.principal, "concurrent review")
				}()
			}
			wg.Wait()
			close(results)
			var committed int
			for err := range results {
				if err == nil {
					committed++
				} else if !errors.Is(err, ErrApprovalConflict) {
					t.Fatalf("unexpected concurrent failure: %v", err)
				}
			}
			if committed != 1 || f.effectCount(t) != 1 || f.status(t) != domain.ApprovalExecuted {
				t.Fatalf("committed=%d effects=%d approval=%s", committed, f.effectCount(t), f.status(t))
			}
		})
	}
}
