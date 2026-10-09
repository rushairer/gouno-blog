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
	opsdomain "github.com/rushairer/blog-backend/internal/operations/domain"
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
	postID     int64
}

var atomicApprovalTestActions = []string{
	"create_editorial_task", "reply_comment", "create_content_candidates",
	"create_media_candidate", "create_distribution_draft", "create_operational_suggestion",
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
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_content_candidate_sets WHERE source_approval_id=$1`, fixture.approvalID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_media_candidates WHERE source_approval_id=$1`, fixture.approvalID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM ai_operational_suggestions WHERE source_type=$1 AND source_run_id=$2`, "approval_atomic_fixture", runID)
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
	var beforeSnapshot any
	var targetID any
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
	case "create_operational_suggestion":
		targetType = "suggestion"
		payload = json.RawMessage(fmt.Sprintf(`{"source_type":"approval_atomic_fixture","source_key":"suggestion-%d","source_run_id":999999,"title":"Atomic improvement","description":"Proposed improvement","priority":"high","evidence":{"source":"approved"}}`, runID))
	case "create_content_candidates", "create_media_candidate", "create_distribution_draft":
		suffix := fmt.Sprintf("%d", time.Now().UnixNano())
		if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,status)
			VALUES($1,$2,'before summary','body','draft') RETURNING id`,
			"Candidate approval "+suffix, "atomic-candidate-"+suffix).Scan(&postID); err != nil {
			t.Fatal(err)
		}
		var revision int64
		if err := db.QueryRowContext(ctx, `SELECT revision FROM posts WHERE id=$1`, postID).Scan(&revision); err != nil {
			t.Fatal(err)
		}
		if revision <= 0 {
			t.Fatal("persisted post must have a positive revision for guarded media approval")
		}
		before, err := json.Marshal(map[string]any{
			"id": postID, "revision": revision, "title": "Before title", "summary": "before summary",
		})
		if err != nil {
			t.Fatal(err)
		}
		beforeSnapshot = string(before)
		targetID = postID
		targetType = "post"
		if action == "create_content_candidates" {
			payload = json.RawMessage(fmt.Sprintf(`{"post_id":%d,"field_type":"title","candidates":[{"value":"A","rationale":"a"},{"value":"B","rationale":"b"}]}`, postID))
		} else {
			payload = json.RawMessage(fmt.Sprintf(`{"post_id":%d,"format":"image_brief","headline":"Candidate","body":"An image brief","platform":"blog","alt_text":"Proposed"}`, postID))
		}
	default:
		t.Fatalf("unsupported test approval action %q", action)
	}
	fixture.postID = postID
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,target_id,proposed_payload,before_snapshot,status)
		VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'pending') RETURNING id`,
		runID, toolCallID, action, targetType, targetID, string(payload), beforeSnapshot).Scan(&fixture.approvalID); err != nil {
		t.Fatal(err)
	}
	fixture.principal = testsupport.Principal(t, db)
	return fixture
}

func (f *atomicApprovalFixture) service(store ApprovalStore, runner ApprovalTransactionRunner) *ApprovalService {
	return &ApprovalService{
		approvals: store, effects: f.effects, transactor: runner,
		mediaCandidates: agentrepository.NewMediaCandidateRepository(f.db),
	}
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
	var query string
	switch f.action {
	case "create_editorial_task":
		query = `SELECT COUNT(*) FROM ai_editorial_tasks WHERE source_approval_id=$1`
	case "reply_comment":
		query = `SELECT COUNT(*) FROM ai_comment_reply_drafts WHERE source_approval_id=$1`
	case "create_content_candidates":
		query = `SELECT COUNT(*) FROM ai_content_candidate_sets WHERE source_approval_id=$1`
	case "create_media_candidate", "create_distribution_draft":
		query = `SELECT COUNT(*) FROM ai_media_candidates WHERE source_approval_id=$1`
	case "create_operational_suggestion":
		query = `SELECT COUNT(*) FROM ai_operational_suggestions WHERE source_type='approval_atomic_fixture' AND source_run_id=(SELECT run_id FROM ai_approvals WHERE id=$1)`
	default:
		t.Fatalf("unsupported effect count for %q", f.action)
	}
	if err := f.db.QueryRowContext(context.Background(), query, f.approvalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

// contentCandidateCount also proves the child rows are in the same
// transaction as the candidate-set header and the approval transition.
func (f *atomicApprovalFixture) contentCandidateCount(t *testing.T) int {
	t.Helper()
	var n int
	err := f.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM ai_content_candidates
		WHERE candidate_set_id IN (SELECT id FROM ai_content_candidate_sets WHERE source_approval_id=$1)`, f.approvalID).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestAtomicApprovalCommitsEffectAndStatus(t *testing.T) {
	for _, action := range atomicApprovalTestActions {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(f.repo, f.transactor)
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "approved"); err != nil {
				t.Fatal(err)
			}
			if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 1 {
				t.Fatalf("committed approval status=%s effect count=%d", f.status(t), f.effectCount(t))
			}
			if action == "create_content_candidates" && f.contentCandidateCount(t) != 2 {
				t.Fatalf("candidate children=%d, want 2", f.contentCandidateCount(t))
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

func TestAtomicApprovalRollsBackSideEffectIfStatusFails(t *testing.T) {
	for _, action := range atomicApprovalTestActions {
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
			if action == "create_content_candidates" && f.contentCandidateCount(t) != 0 {
				t.Fatalf("rollback left %d candidate children", f.contentCandidateCount(t))
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

func TestAtomicApprovalCommitAckLossKeepsOneEffectAndExecutedStatus(t *testing.T) {
	for _, action := range atomicApprovalTestActions {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			svc := f.service(f.repo, lostCommitReplyTransactor{real: f.transactor})
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "approved"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
				t.Fatalf("error=%v, want uncertain result", err)
			}
			if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 1 {
				t.Fatalf("post-commit state= %s / %d effects", f.status(t), f.effectCount(t))
			}
			if action == "create_content_candidates" && f.contentCandidateCount(t) != 2 {
				t.Fatalf("committed candidate children=%d, want 2", f.contentCandidateCount(t))
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("unsafe replay after committed acknowledgement loss: %v", err)
			}
		})
	}
}

func TestAtomicApprovalConcurrentReviewers(t *testing.T) {
	for _, action := range atomicApprovalTestActions {
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
			if action == "create_content_candidates" && f.contentCandidateCount(t) != 2 {
				t.Fatalf("concurrent candidate children=%d, want 2", f.contentCandidateCount(t))
			}
		})
	}
}

func TestAtomicMediaCandidateRejectsStalePostRevision(t *testing.T) {
	for _, action := range []string{"create_media_candidate", "create_distribution_draft"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			if _, err := f.db.ExecContext(context.Background(), `UPDATE posts
				SET revision=revision+1 WHERE id=$1`, f.postID); err != nil {
				t.Fatal(err)
			}
			svc := f.service(f.repo, f.transactor)
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "stale"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
				t.Fatalf("stale revision error=%v, want quarantined failure", err)
			}
			if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
				t.Fatalf("stale media incorrectly persisted: status=%s rows=%d", f.status(t), f.effectCount(t))
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "replay"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("stale approval replayed: %v", err)
			}
		})
	}
}

func TestAtomicDistributionNonImageIsNoEffect(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_distribution_draft")
	payload := fmt.Sprintf(`{"post_id":%d,"format":"social","body":"A draft for later review"}`, f.postID)
	if _, err := f.db.ExecContext(context.Background(), `UPDATE ai_approvals SET proposed_payload=$2::jsonb WHERE id=$1`,
		f.approvalID, payload); err != nil {
		t.Fatal(err)
	}
	svc := f.service(f.repo, f.transactor)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "social draft"); err != nil {
		t.Fatal(err)
	}
	if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 0 {
		t.Fatalf("non-image distribution produced media: status=%s rows=%d", f.status(t), f.effectCount(t))
	}
}
