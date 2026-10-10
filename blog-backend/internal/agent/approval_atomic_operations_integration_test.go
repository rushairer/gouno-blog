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
	pagedomain "github.com/rushairer/blog-backend/internal/page/domain"
	pagerepository "github.com/rushairer/blog-backend/internal/page/repository"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
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
	pageID     int64
	pageUpdatedAt time.Time
}

var atomicApprovalTestActions = []string{
	"create_editorial_task", "reply_comment", "create_content_candidates",
	"create_media_candidate", "create_distribution_draft", "create_operational_suggestion",
	"create_draft", "update_post", "update_tags", "create_page_draft", "update_page",
}

func newAtomicApprovalFixture(t *testing.T, action string) *atomicApprovalFixture {
	t.Helper()
	db := testsupport.OpenTestDB(t)
	ctx := context.Background()
	fixture := &atomicApprovalFixture{db: db, repo: agentrepository.NewApprovalRepository(db), transactor: dbtx.NewTransactor(db, nil), action: action}
	fixture.effects = operations.NewService(db, nil, nil, fixture.transactor)

	var agentID, runID, toolCallID, postID, commentID, pageID int64
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
		_, _ = db.ExecContext(context.Background(), `DELETE FROM posts WHERE slug=$1`, fmt.Sprintf("atomic-draft-%d", runID))
		_, _ = db.ExecContext(context.Background(), `DELETE FROM pages WHERE slug=$1`, fmt.Sprintf("atomic-page-draft-%d", runID))
		if pageID != 0 {
			_, _ = db.ExecContext(context.Background(), `DELETE FROM pages WHERE id=$1`, pageID)
		}
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
	case "create_page_draft":
		targetType = "page"
		payload = json.RawMessage(fmt.Sprintf(`{"title":"Approved page draft","slug":"/ATOMIC-PAGE-DRAFT-%d/","summary":"new","content":"Approved page draft body","template":"default","show_in_nav":false}`, runID))
	case "update_page":
		targetType = "page"
		p := &pagedomain.Page{
			Title: "Original page", Slug: fmt.Sprintf("atomic-page-update-%d", time.Now().UnixNano()),
			Content: "Original page body", Summary: "Before summary",
			Template: "default", Status: pagedomain.PageStatusDraft,
		}
		if err := pagerepository.NewPageRepository(db).Create(ctx, p); err != nil {
			t.Fatal(err)
		}
		pageID = p.ID
		fixture.pageUpdatedAt = p.UpdatedAt
		before, err := json.Marshal(p)
		if err != nil {
			t.Fatal(err)
		}
		beforeSnapshot = string(before)
		targetID = pageID
		payload = json.RawMessage(`{"title":"Approved page update","summary":"Approved page summary","content":"Approved page body","show_in_nav":true}`)
	case "create_draft":
		targetType = "post"
		payload = json.RawMessage(fmt.Sprintf(`{"title":"Approved draft","slug":"atomic-draft-%d","summary":"","content":"Proposed body","tags":["go"]}`, runID))
	case "update_post", "update_tags":
		suffix := fmt.Sprintf("%d", time.Now().UnixNano())
		if err := db.QueryRowContext(ctx, `INSERT INTO posts(title,slug,summary,content,tags,status)
			VALUES($1,$2,'Before summary','Original body',ARRAY['before']::text[],'draft') RETURNING id`,
			"Original title", "atomic-update-"+suffix).Scan(&postID); err != nil {
			t.Fatal(err)
		}
		var revision int64
		if err := db.QueryRowContext(ctx, `SELECT revision FROM posts WHERE id=$1`, postID).Scan(&revision); err != nil {
			t.Fatal(err)
		}
		before, err := json.Marshal(map[string]any{"id":postID,"revision":revision,"title":"Original title"})
		if err != nil {
			t.Fatal(err)
		}
		beforeSnapshot = string(before)
		targetType = "post"
		targetID = postID
		if action == "update_tags" {
			payload = json.RawMessage(`{"tags":["approved","tags"]}`)
		} else {
			payload = json.RawMessage(`{"title":"Approved title","summary":"Updated summary","content":"Approved content"}`)
		}
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
	fixture.pageID = pageID
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
		posts: postservice.NewPostService(postrepository.NewPostRepository(f.db)),
		pages: pageservice.NewPageService(pagerepository.NewPageRepository(f.db)),
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
	case "create_draft":
		query = `SELECT COUNT(*) FROM posts WHERE slug=(SELECT CONCAT('atomic-draft-', run_id::text) FROM ai_approvals WHERE id=$1)`
	case "update_post":
		query = `SELECT COUNT(*) FROM posts WHERE id=(SELECT target_id FROM ai_approvals WHERE id=$1) AND title='Approved title'`
	case "update_tags":
		query = `SELECT COUNT(*) FROM posts WHERE id=(SELECT target_id FROM ai_approvals WHERE id=$1) AND tags=ARRAY['approved','tags']::text[]`
	case "create_page_draft":
		query = `SELECT COUNT(*) FROM pages WHERE slug=(SELECT CONCAT('atomic-page-draft-', run_id::text) FROM ai_approvals WHERE id=$1)`
	case "update_page":
		query = `SELECT COUNT(*) FROM pages WHERE id=(SELECT target_id FROM ai_approvals WHERE id=$1) AND title='Approved page update'`
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

// assertPostTransactionEffects checks business rows, the PostVersion trigger,
// the Post workflow-event trigger, revision advancement and approval target ID.
// All must follow the same COMMIT/ROLLBACK decision.
func (f *atomicApprovalFixture) assertPostTransactionEffects(t *testing.T, committed bool) {
	t.Helper()
	ctx := context.Background()
	switch f.action {
	case "create_draft":
		approval, err := f.repo.GetApproval(ctx, f.approvalID)
		if err != nil {
			t.Fatal(err)
		}
		if (approval.TargetID != nil) != committed {
			t.Fatalf("draft target persisted out of sync with commit: committed=%t target=%v", committed, approval.TargetID)
		}
		var eventCount int
		if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_events
			WHERE event_type='post.published' AND payload->>'post_id' IN
			(SELECT id::text FROM posts WHERE slug=(SELECT CONCAT('atomic-draft-', run_id::text) FROM ai_approvals WHERE id=$1))`,
			f.approvalID).Scan(&eventCount); err != nil {
			t.Fatal(err)
		}
		want := 0
		if committed {
			want = 1
			var postID int64
			var status string
			if err := f.db.QueryRowContext(ctx, `SELECT id,status FROM posts WHERE
				slug=(SELECT CONCAT('atomic-draft-', run_id::text) FROM ai_approvals WHERE id=$1)`,
				f.approvalID).Scan(&postID, &status); err != nil {
				t.Fatal(err)
			}
			if postID != *approval.TargetID || status != "draft" {
				t.Fatalf("draft target/status mismatch: post=%d target=%d status=%s", postID, *approval.TargetID, status)
			}
		}
		if eventCount != want {
			t.Fatalf("draft event count=%d want=%d", eventCount, want)
		}
	case "update_post", "update_tags":
		var revision int64
		if err := f.db.QueryRowContext(ctx, `SELECT revision FROM posts WHERE id=$1`, f.postID).Scan(&revision); err != nil {
			t.Fatal(err)
		}
		var versions, events int
		if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM post_versions WHERE post_id=$1`, f.postID).Scan(&versions); err != nil {
			t.Fatal(err)
		}
		if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_workflow_events
			WHERE event_type='post.updated' AND payload->>'post_id'=$1`, fmt.Sprint(f.postID)).Scan(&events); err != nil {
			t.Fatal(err)
		}
		wantRevision, wantEffects := int64(1), 0
		if committed {
			wantRevision, wantEffects = 2, 1
		}
		if revision != wantRevision || versions != wantEffects || events != wantEffects {
			t.Fatalf("post/trigger commit mismatch: revision=%d versions=%d events=%d; want %d/%d/%d",
				revision, versions, events, wantRevision, wantEffects, wantEffects)
		}
	}
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
			f.assertPostTransactionEffects(t, true)
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
			f.assertPostTransactionEffects(t, false)
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
			f.assertPostTransactionEffects(t, true)
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
			f.assertPostTransactionEffects(t, true)
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

func TestAtomicOperationalSuggestionPreservesDedupeAndTerminalState(t *testing.T) {
	cases := []struct {
		name, initialStatus, expectedEvidence string
	}{
		{"new suggestion refreshes evidence", "new", "approved"},
		{"resolved suggestion stays resolved", "resolved", "existing"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, "create_operational_suggestion")
			ctx := context.Background()
			approval, err := f.repo.GetApproval(ctx, f.approvalID)
			if err != nil {
				t.Fatal(err)
			}
			var prior opsdomain.OperationalSuggestion
			if err := json.Unmarshal(approval.ProposedPayload, &prior); err != nil {
				t.Fatal(err)
			}
			prior.SourceRunID = &approval.RunID
			prior.Evidence = json.RawMessage(`{"source":"existing"}`)
			if err := f.effects.CreateOperationalSuggestion(ctx, &prior); err != nil {
				t.Fatal(err)
			}
			if tc.initialStatus != "new" {
				if _, err := f.db.ExecContext(ctx,
					`UPDATE ai_operational_suggestions SET status=$2 WHERE source_type=$1 AND source_run_id=$3`,
					prior.SourceType, tc.initialStatus, approval.RunID); err != nil {
					t.Fatal(err)
				}
			}
			if err := f.service(f.repo, f.transactor).Approve(ctx, f.approvalID, f.principal, "review"); err != nil {
				t.Fatal(err)
			}
			if f.status(t) != domain.ApprovalExecuted || f.effectCount(t) != 1 {
				t.Fatalf("duplicate or incomplete suggestion: approval=%s count=%d", f.status(t), f.effectCount(t))
			}
			var status string
			var evidence []byte
			var sourceRunID int64
			if err := f.db.QueryRowContext(ctx,
				`SELECT status,evidence,source_run_id FROM ai_operational_suggestions
				 WHERE source_type=$1 AND source_key=$2`, prior.SourceType, prior.SourceKey).
				Scan(&status, &evidence, &sourceRunID); err != nil {
				t.Fatal(err)
			}
			var value struct { Source string `json:"source"` }
			if err := json.Unmarshal(evidence, &value); err != nil {
				t.Fatal(err)
			}
			if status != tc.initialStatus || value.Source != tc.expectedEvidence || sourceRunID != approval.RunID {
				t.Fatalf("dedupe regression: status=%q source=%q runID=%d, expected status=%q source=%q runID=%d",
					status, value.Source, sourceRunID, tc.initialStatus, tc.expectedEvidence, approval.RunID)
			}
		})
	}
}

func TestAtomicOperationalSuggestionDedupeUpdateRollsBackWithApproval(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_operational_suggestion")
	ctx := context.Background()
	approval, err := f.repo.GetApproval(ctx, f.approvalID)
	if err != nil {
		t.Fatal(err)
	}
	var prior opsdomain.OperationalSuggestion
	if err := json.Unmarshal(approval.ProposedPayload, &prior); err != nil {
		t.Fatal(err)
	}
	prior.SourceRunID = &approval.RunID
	prior.Evidence = json.RawMessage(`{"source":"existing"}`)
	if err := f.effects.CreateOperationalSuggestion(ctx, &prior); err != nil {
		t.Fatal(err)
	}
	svc := f.service(&rollbackApprovalStatusStore{ApprovalRepository: f.repo}, f.transactor)
	if err := svc.Approve(ctx, f.approvalID, f.principal, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("error=%v, want quarantined outcome", err)
	}
	if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 1 {
		t.Fatalf("uncommitted approval or suggestion: status=%s count=%d", f.status(t), f.effectCount(t))
	}
	var evidence []byte
	if err := f.db.QueryRowContext(ctx,
		`SELECT evidence FROM ai_operational_suggestions WHERE source_type=$1 AND source_key=$2`,
		prior.SourceType, prior.SourceKey).Scan(&evidence); err != nil {
		t.Fatal(err)
	}
	var value struct { Source string `json:"source"` }
	if err := json.Unmarshal(evidence, &value); err != nil {
		t.Fatal(err)
	}
	if value.Source != "existing" {
		t.Fatalf("rollback leaked suggestion update, source=%q", value.Source)
	}
	if err := svc.Approve(ctx, f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("quarantined approval replayed: %v", err)
	}
}

type failApprovalTargetStore struct {
	*agentrepository.ApprovalRepository
}

func (f *failApprovalTargetStore) SetApprovalTargetTx(context.Context, *sql.Tx, int64, int64) error {
	return errors.New("injected: cannot store generated Post target")
}

func TestAtomicPostDraftTargetAssignmentFailureRollsBackContentAndEvents(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_draft")
	svc := f.service(&failApprovalTargetStore{ApprovalRepository: f.repo}, f.transactor)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("target assignment failure=%v, want quarantined outcome", err)
	}
	if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
		t.Fatalf("draft escaped rollback: approval=%s rows=%d", f.status(t), f.effectCount(t))
	}
	f.assertPostTransactionEffects(t, false)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("unsafe draft replay: %v", err)
	}
}

type advancePostAfterClaimStore struct {
	*agentrepository.ApprovalRepository
	db     *sql.DB
	postID int64
}

func (s *advancePostAfterClaimStore) ClaimApproval(ctx context.Context, approvalID, principalID int64, note string) error {
	if err := s.ApprovalRepository.ClaimApproval(ctx, approvalID, principalID, note); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `UPDATE posts SET content=content || ' competing edit' WHERE id=$1`, s.postID)
	return err
}

func TestAtomicPostUpdateRejectsConcurrentRevisionAfterClaim(t *testing.T) {
	for _, action := range []string{"update_post", "update_tags"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			store := &advancePostAfterClaimStore{ApprovalRepository: f.repo, db: f.db, postID: f.postID}
			svc := f.service(store, f.transactor)
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "stale review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
				t.Fatalf("concurrent post update result=%v, want quarantine", err)
			}
			if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
				t.Fatalf("stale review applied: status=%s changed=%d", f.status(t), f.effectCount(t))
			}
			var revision int64
			var versions int
			var content string
			if err := f.db.QueryRowContext(context.Background(), `SELECT content, revision FROM posts WHERE id=$1`, f.postID).
				Scan(&content, &revision); err != nil {
				t.Fatal(err)
			}
			if err := f.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM post_versions WHERE post_id=$1`, f.postID).Scan(&versions); err != nil {
				t.Fatal(err)
			}
			if content != "Original body competing edit" || revision != 2 || versions != 1 {
				t.Fatalf("lost external edit or repeated snapshot: content=%q revision=%d versions=%d", content, revision, versions)
			}
			if err := svc.Approve(context.Background(), f.approvalID, f.principal, "replay"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("stale approval replayed: %v", err)
			}
		})
	}
}

func TestAtomicDraftIgnoresAttemptedStatusAndPrincipalEscalation(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_draft")
	var runID int64
	if err := f.db.QueryRowContext(context.Background(), `SELECT run_id FROM ai_approvals WHERE id=$1`,
		f.approvalID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	payload := fmt.Sprintf(`{"title":"Approved draft","slug":"atomic-draft-%d","content":"body",
		"status":"published","created_by_principal_id":99999999,"updated_by_principal_id":99999999,
		"revision":99999999}`, runID)
	if _, err := f.db.ExecContext(context.Background(), `UPDATE ai_approvals SET proposed_payload=$2::jsonb WHERE id=$1`,
		f.approvalID, payload); err != nil {
		t.Fatal(err)
	}
	if err := f.service(f.repo, f.transactor).Approve(context.Background(), f.approvalID, f.principal, "approved"); err != nil {
		t.Fatal(err)
	}
	var status string
	var createdBy, updatedBy sql.NullInt64
	var revision int64
	if err := f.db.QueryRowContext(context.Background(), `SELECT status,created_by_principal_id,updated_by_principal_id,revision
		FROM posts WHERE slug=$1`, fmt.Sprintf("atomic-draft-%d", runID)).
		Scan(&status, &createdBy, &updatedBy, &revision); err != nil {
		t.Fatal(err)
	}
	if status != "draft" || createdBy.Valid || updatedBy.Valid || revision != 1 {
		t.Fatalf("draft privilege escalation: status=%q created=%v updated=%v revision=%d",
			status, createdBy, updatedBy, revision)
	}
}
