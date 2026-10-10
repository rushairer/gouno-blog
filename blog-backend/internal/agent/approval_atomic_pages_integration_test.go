package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	pagedomain "github.com/rushairer/blog-backend/internal/page/domain"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
)

// A Page created successfully inside the Tx must disappear if the approval's
// target identity cannot be persisted. Never leave unowned approved content.
func TestAtomicPageDraftTargetFailureRollsBackPage(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_page_draft")
	svc := f.service(&failApprovalTargetStore{ApprovalRepository: f.repo}, f.transactor)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("target assignment failure=%v, want quarantined outcome", err)
	}
	if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
		t.Fatalf("Page escaped rollback: status=%s rows=%d", f.status(t), f.effectCount(t))
	}
	f.assertPageTransactionEffects(t, false)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("unsafe Page draft replay: %v", err)
	}
}

type advancePageAfterClaimStore struct {
	*agentrepository.ApprovalRepository
	db *sql.DB
	pageID int64
}

func (s *advancePageAfterClaimStore) ClaimApproval(ctx context.Context, approvalID, reviewerID int64, note string) error {
	if err := s.ApprovalRepository.ClaimApproval(ctx, approvalID, reviewerID, note); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `UPDATE pages
		SET content=content || ' competing edit',
		updated_at=GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
		WHERE id=$1`, s.pageID)
	return err
}

// The pre-claim timestamp check passes, then a competing editor modifies the
// Page. Execution must verify the snapshot again inside the shared Tx.
func TestAtomicPageRejectsChangeAfterDurableReviewerClaim(t *testing.T) {
	f := newAtomicApprovalFixture(t, "update_page")
	store := &advancePageAfterClaimStore{ApprovalRepository:f.repo, db:f.db, pageID:f.pageID}
	svc := f.service(store, f.transactor)
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("stale page outcome=%v, want in-doubt quarantine", err)
	}
	if f.status(t) != domain.ApprovalApproved || f.effectCount(t) != 0 {
		t.Fatalf("stale proposal overwrote concurrent edit: status=%s effects=%d", f.status(t), f.effectCount(t))
	}
	page, err := svc.pages.GetPage(context.Background(), f.pageID)
	if err != nil {
		t.Fatal(err)
	}
	if page.Content != "Original page body competing edit" || !page.UpdatedAt.After(f.pageUpdatedAt) {
		t.Fatalf("lost competing editor change: content=%q updated=%v expected after=%v",
			page.Content, page.UpdatedAt, f.pageUpdatedAt)
	}
	if err := svc.Approve(context.Background(), f.approvalID, f.principal, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("unsafe replay of stale Page update: %v", err)
	}
}

// Even if a transactional read was current at the moment of selection, a
// later concurrent write MUST fail the final SQL timestamp CAS. The
// comparison in Agent.validateConflict alone would not provide this safety.
func TestPageFinalSQLTimestampCASAfterTransactionalRead(t *testing.T) {
	f := newAtomicApprovalFixture(t, "update_page")
	ctx := context.Background()
	pageService := f.service(f.repo, f.transactor).pages
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	page, err := pageService.GetPageTx(ctx, tx, f.pageID)
	if err != nil {
		t.Fatal(err)
	}
	originalTimestamp := page.UpdatedAt
	if _, err := f.db.ExecContext(ctx, `UPDATE pages SET title='Competing editor title',
		updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 microsecond') WHERE id=$1`, f.pageID); err != nil {
		t.Fatal(err)
	}
	page.Title = "Attempted stale update"
	if err := pageService.UpdatePageTx(ctx, tx, page, originalTimestamp); !errors.Is(err, pageservice.ErrPageApprovalConflict) {
		t.Fatalf("final SQL CAS result=%v, want immutable snapshot conflict", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	latest, err := pageService.GetPage(ctx, f.pageID)
	if err != nil {
		t.Fatal(err)
	}
	if latest.Title != "Competing editor title" || !latest.UpdatedAt.After(originalTimestamp) {
		t.Fatalf("stale write replaced latest Page: %#v", latest)
	}
}

func TestPageApprovalRequiresMatchingNonzeroSnapshotBeforeClaim(t *testing.T) {
	for _, tc := range []struct {
		name string
		before func(*atomicApprovalFixture) any
	}{
		{"missing", func(*atomicApprovalFixture) any { return nil }},
		{"wrong page identity", func(f *atomicApprovalFixture) any {
			before, err := json.Marshal(pagedomain.Page{ID:f.pageID+9999, UpdatedAt:f.pageUpdatedAt})
			if err != nil { t.Fatal(err) }
			return string(before)
		}},
		{"missing timestamp", func(f *atomicApprovalFixture) any {
			before, err := json.Marshal(pagedomain.Page{ID:f.pageID})
			if err != nil { t.Fatal(err) }
			return string(before)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, "update_page")
			if _, err := f.db.ExecContext(context.Background(),
				`UPDATE ai_approvals SET before_snapshot=$2::jsonb WHERE id=$1`, f.approvalID, tc.before(f)); err != nil {
				t.Fatal(err)
			}
			if err := f.service(f.repo, f.transactor).Approve(context.Background(), f.approvalID, f.principal, "review"); !errors.Is(err, ErrApprovalConflict) {
				t.Fatalf("invalid snapshot accepted: %v", err)
			}
			if f.status(t) != domain.ApprovalPending || f.effectCount(t) != 0 {
				t.Fatalf("invalid snapshot reached reviewer claim: status=%s effects=%d", f.status(t), f.effectCount(t))
			}
		})
	}
}

func TestAtomicPageDraftAlwaysRemainsDraftAndNormalizesSlug(t *testing.T) {
	f := newAtomicApprovalFixture(t, "create_page_draft")
	var runID int64
	if err := f.db.QueryRowContext(context.Background(), `SELECT run_id FROM ai_approvals WHERE id=$1`, f.approvalID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	payload := fmt.Sprintf(`{"title":"Approved page draft","slug":"/ATOMIC-PAGE-DRAFT-%d/",
		"content":"body","status":"published","id":99999999,
		"created_at":"2040-01-01T00:00:00Z","updated_at":"2040-01-01T00:00:00Z"}`, runID)
	if _, err := f.db.ExecContext(context.Background(), `UPDATE ai_approvals SET proposed_payload=$2::jsonb WHERE id=$1`,
		f.approvalID, payload); err != nil {
		t.Fatal(err)
	}
	if err := f.service(f.repo, f.transactor).Approve(context.Background(), f.approvalID, f.principal, "review"); err != nil {
		t.Fatal(err)
	}
	page, err := f.service(f.repo, f.transactor).pages.GetPageBySlug(context.Background(), fmt.Sprintf("atomic-page-draft-%d",runID))
	if err != nil { t.Fatal(err) }
	if page.Status != pagedomain.PageStatusDraft || page.ID == 99999999 || page.Template != "default" ||
		page.CreatedAt.After(time.Now().Add(time.Hour)) || page.UpdatedAt.After(time.Now().Add(time.Hour)) {
		t.Fatalf("Page draft escaped proposal allowlist: %#v",page)
	}
	f.assertPageTransactionEffects(t, true)
}

func TestAtomicPageReservedSlugCannotCommit(t *testing.T) {
	for _, action := range []string{"create_page_draft","update_page"} {
		t.Run(action, func(t *testing.T) {
			f := newAtomicApprovalFixture(t, action)
			payload := `{"title":"Reserved page","slug":"/ADMIN/"}`
			if _, err := f.db.ExecContext(context.Background(),
				`UPDATE ai_approvals SET proposed_payload=$2::jsonb WHERE id=$1`, f.approvalID, payload); err != nil {
				t.Fatal(err)
			}
			if err := f.service(f.repo,f.transactor).Approve(context.Background(),f.approvalID,f.principal,"review"); !errors.Is(err,ErrApprovalOutcomeUncertain) {
				t.Fatalf("reserved Page Slug was accepted: %v", err)
			}
			if f.status(t)!=domain.ApprovalApproved || f.effectCount(t)!=0 {
				t.Fatalf("reserved Slug caused partial commit: status=%s effects=%d",f.status(t),f.effectCount(t))
			}
		})
	}
}

func TestAtomicPageUpdatePreservesStatusAndIDFieldAllowlist(t *testing.T) {
	f := newAtomicApprovalFixture(t, "update_page")
	newSlug := fmt.Sprintf("approved-page-%d", f.pageID)
	payload := fmt.Sprintf(`{"title":"Approved page update","status":"published","slug":"/%s/",
		"id":999999999,"updated_at":"2040-01-01T00:00:00Z"}`, newSlug)
	if _, err := f.db.ExecContext(context.Background(),`UPDATE ai_approvals SET proposed_payload=$2::jsonb WHERE id=$1`,
		f.approvalID,payload); err != nil { t.Fatal(err) }
	if err := f.service(f.repo,f.transactor).Approve(context.Background(),f.approvalID,f.principal,"review"); err != nil { t.Fatal(err) }
	page,err:=f.service(f.repo,f.transactor).pages.GetPage(context.Background(),f.pageID)
	if err != nil { t.Fatal(err) }
	if page.ID!=f.pageID || page.Slug!=newSlug || page.Status!=pagedomain.PageStatusPublished ||
		!page.UpdatedAt.After(f.pageUpdatedAt) || page.UpdatedAt.After(time.Now().Add(time.Hour)) {
		t.Fatalf("Page allowed-field contract drift: %#v", page)
	}
}
