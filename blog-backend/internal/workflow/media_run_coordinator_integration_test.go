package workflow

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

func newTestMediaRunCoordinator(db *sql.DB) *MediaRunCoordinator {
	return NewMediaRunCoordinator(dbtx.NewTransactor(db, nil), workflowrepository.NewMediaRunRepository(), agentrepository.NewMediaCandidateRepository(db))
}

func TestMediaRunCoordinatorResumeAfterApproval(t *testing.T) {
	f := newLifecycleFixture(t, "awaiting_approval")
	coordinator := newTestMediaRunCoordinator(f.db)

	if err := coordinator.ResumeAfterApproval(context.Background(), f.run); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("resume with candidate: %v", err)
	}
	f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "awaiting_approval", f.run)

	if _, err := f.db.Exec(`DELETE FROM ai_media_candidates WHERE id=$1`, f.candidate); err != nil {
		t.Fatal(err)
	}
	if err := coordinator.ResumeAfterApproval(context.Background(), f.run); err != nil {
		t.Fatal(err)
	}
	f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "queued", f.run)
}

func TestMediaRunCoordinatorReconcilesCandidateLifecycle(t *testing.T) {
	t.Run("pending remains waiting", func(t *testing.T) {
		f := newLifecycleFixture(t, "waiting_for_user")
		if err := newTestMediaRunCoordinator(f.db).Reconcile(context.Background(), f.run); err != nil {
			t.Fatal(err)
		}
		f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "waiting_for_user", f.run)
	})

	t.Run("applied succeeds", func(t *testing.T) {
		f := newLifecycleFixture(t, "waiting_for_user")
		if _, err := f.db.Exec(`UPDATE ai_media_candidates SET applied_version_id=123 WHERE id=$1`, f.candidate); err != nil {
			t.Fatal(err)
		}
		if err := newTestMediaRunCoordinator(f.db).Reconcile(context.Background(), f.run); err != nil {
			t.Fatal(err)
		}
		f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "succeeded", f.run)
	})

	t.Run("terminal un-applied candidates cancel", func(t *testing.T) {
		f := newLifecycleFixture(t, "waiting_for_user")
		if _, err := f.db.Exec(`UPDATE ai_media_candidates SET generation_status='rejected' WHERE id=$1`, f.candidate); err != nil {
			t.Fatal(err)
		}
		if err := newTestMediaRunCoordinator(f.db).Reconcile(context.Background(), f.run); err != nil {
			t.Fatal(err)
		}
		f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "cancelled", f.run)
	})
}

type failingMediaWorkflowRunStore struct{ MediaWorkflowRunStore }

var errMediaRunInjected = errors.New("injected media run failure")

func (s failingMediaWorkflowRunStore) SetMediaRunStateTx(ctx context.Context, tx *sql.Tx, runID int64, status string, finished bool) (bool, error) {
	changed, err := s.MediaWorkflowRunStore.SetMediaRunStateTx(ctx, tx, runID, status, finished)
	if err != nil {
		return false, err
	}
	if changed {
		return false, errMediaRunInjected
	}
	return false, nil
}

func TestMediaRunCoordinatorRollsBackWorkflowWrite(t *testing.T) {
	f := newLifecycleFixture(t, "waiting_for_user")
	if _, err := f.db.Exec(`UPDATE ai_media_candidates SET generation_status='rejected' WHERE id=$1`, f.candidate); err != nil {
		t.Fatal(err)
	}
	base := workflowrepository.NewMediaRunRepository()
	coordinator := NewMediaRunCoordinator(
		dbtx.NewTransactor(f.db, nil),
		failingMediaWorkflowRunStore{MediaWorkflowRunStore: base},
		agentrepository.NewMediaCandidateRepository(f.db),
	)
	if err := coordinator.Reconcile(context.Background(), f.run); !errors.Is(err, errMediaRunInjected) {
		t.Fatalf("reconcile rollback: %v", err)
	}
	f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "waiting_for_user", f.run)
}
