package workflow

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/testsupport"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
)

type lifecycleFixture struct {
	db                                    *sql.DB
	run, agentRun, candidate, interaction int64
	lifecycle                             *RunLifecycle
}

func newLifecycleFixture(t *testing.T, status string) lifecycleFixture {
	t.Helper()
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { db.Close() })
	f := lifecycleFixture{db: db}
	var postID int64
	query := func(dest *int64, q string, args ...any) {
		t.Helper()
		if err := db.QueryRow(q, args...).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}
	query(&f.run, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,status) SELECT workflow_id,id,$1 FROM ai_workflow_versions ORDER BY id LIMIT 1 RETURNING id`, status)
	query(&postID, `INSERT INTO posts(title,slug,content,status) VALUES('lifecycle',$1,'','draft') RETURNING id`, fmt.Sprintf("lifecycle-%d", time.Now().UnixNano()))
	t.Cleanup(func() {
		db.Exec(`DELETE FROM ai_media_candidates WHERE post_id=$1`, postID)
		db.Exec(`DELETE FROM ai_agent_runs WHERE workflow_run_id=$1`, f.run)
		db.Exec(`DELETE FROM ai_workflow_runs WHERE id=$1`, f.run)
		db.Exec(`DELETE FROM posts WHERE id=$1`, postID)
	})
	query(&f.agentRun, `INSERT INTO ai_agent_runs(agent_id,trigger_type,status,provider,model,skill_version_id,workflow_run_id) SELECT id,'manual','succeeded','openai','test',skill_version_id,$1 FROM ai_agents ORDER BY id LIMIT 1 RETURNING id`, f.run)
	query(&f.candidate, `INSERT INTO ai_media_candidates(post_id,source_run_id,workflow_run_id,brief,provider,model,generation_status) VALUES($1,$2,$3,'brief','openai','test','generated') RETURNING id`, postID, f.agentRun, f.run)
	query(&f.interaction, `INSERT INTO workflow_interaction_tasks(workflow_run_id,interaction_type,resume_token) VALUES($1,'approval',$2) RETURNING id`, f.run, fmt.Sprintf("lifecycle-%d", f.run))
	f.lifecycle = NewRunLifecycle(dbtx.NewTransactor(db, nil), workflowrepository.NewRunLifecycleRepository(), agentrepository.NewRunRepository(db), agentrepository.NewMediaCandidateRepository(db))
	return f
}

func (f lifecycleFixture) state(t *testing.T, query, want string, id int64) {
	t.Helper()
	var got string
	if err := f.db.QueryRow(query, id).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("state=%q, want %q", got, want)
	}
}

func TestWorkflowLifecycleCancellation(t *testing.T) {
	for _, status := range []string{"queued", "running", "awaiting_approval", "waiting_for_user"} {
		t.Run(status, func(t *testing.T) {
			f := newLifecycleFixture(t, status)
			if err := (&Service{lifecycle: f.lifecycle}).Cancel(context.Background(), f.run); err != nil {
				t.Fatal(err)
			}
			f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "cancelled", f.run)
			f.state(t, `SELECT status FROM workflow_interaction_tasks WHERE id=$1`, "cancelled", f.interaction)
			f.state(t, `SELECT generation_status FROM ai_media_candidates WHERE id=$1`, "cancelled", f.candidate)
			// Cancellation deliberately does not cancel Agent run execution.
			f.state(t, `SELECT status FROM ai_agent_runs WHERE id=$1`, "succeeded", f.agentRun)
			if err := f.lifecycle.Cancel(context.Background(), f.run); !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf("repeat cancel: %v", err)
			}
		})
	}
}

func TestWorkflowLifecyclePreservesAppliedAndInactiveCandidates(t *testing.T) {
	for _, status := range []string{"generated", "failed", "rejected", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			f := newLifecycleFixture(t, "running")
			var applied any
			if status == "generated" {
				applied = int64(123)
			}
			if _, err := f.db.Exec(`UPDATE ai_media_candidates SET generation_status=$2,applied_version_id=$3 WHERE id=$1`, f.candidate, status, applied); err != nil {
				t.Fatal(err)
			}
			if err := f.lifecycle.Cancel(context.Background(), f.run); err != nil {
				t.Fatal(err)
			}
			f.state(t, `SELECT generation_status FROM ai_media_candidates WHERE id=$1`, status, f.candidate)
		})
	}
}

func TestWorkflowLifecycleDeletion(t *testing.T) {
	for _, status := range []string{"queued", "running", "awaiting_approval", "waiting_for_user", "succeeded", "failed", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			f := newLifecycleFixture(t, status)
			// A candidate linked only through its Agent run must also be deleted.
			if _, err := f.db.Exec(`UPDATE ai_media_candidates SET workflow_run_id=NULL WHERE id=$1`, f.candidate); err != nil {
				t.Fatal(err)
			}
			err := (&Service{lifecycle: f.lifecycle}).DeleteRun(context.Background(), f.run)
			if status != "succeeded" && status != "failed" && status != "cancelled" {
				if !errors.Is(err, ErrInvalid) {
					t.Fatalf("delete active: %v", err)
				}
				f.state(t, `SELECT generation_status FROM ai_media_candidates WHERE id=$1`, "generated", f.candidate)
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			for _, check := range []struct {
				table string
				id    int64
			}{{"ai_workflow_runs", f.run}, {"ai_agent_runs", f.agentRun}, {"ai_media_candidates", f.candidate}, {"workflow_interaction_tasks", f.interaction}} {
				var count int
				if err := f.db.QueryRow(`SELECT COUNT(*) FROM `+check.table+` WHERE id=$1`, check.id).Scan(&count); err != nil {
					t.Fatal(err)
				}
				if count != 0 {
					t.Fatalf("%s still has row", check.table)
				}
			}
			if err := f.lifecycle.DeleteRun(context.Background(), f.run); !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf("missing delete: %v", err)
			}
		})
	}
}

type failingLifecycleMedia struct{ LifecycleMediaCandidateStore }

var errLifecycleInjected = errors.New("injected failure after media persistence")

func (s failingLifecycleMedia) CancelByWorkflowRunTx(ctx context.Context, tx *sql.Tx, id int64) error {
	if err := s.LifecycleMediaCandidateStore.CancelByWorkflowRunTx(ctx, tx, id); err != nil {
		return err
	}
	return errLifecycleInjected
}

type failingLifecycleWorkflows struct{ LifecycleWorkflowStore }

func (s failingLifecycleWorkflows) DeleteRunTx(ctx context.Context, tx *sql.Tx, id int64) error {
	if err := s.LifecycleWorkflowStore.DeleteRunTx(ctx, tx, id); err != nil {
		return err
	}
	return errLifecycleInjected
}

func TestWorkflowLifecycleRollbackAcrossCapabilities(t *testing.T) {
	t.Run("cancel after media write", func(t *testing.T) {
		f := newLifecycleFixture(t, "running")
		f.lifecycle.media = failingLifecycleMedia{f.lifecycle.media}
		if err := f.lifecycle.Cancel(context.Background(), f.run); !errors.Is(err, errLifecycleInjected) {
			t.Fatal(err)
		}
		f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "running", f.run)
		f.state(t, `SELECT status FROM workflow_interaction_tasks WHERE id=$1`, "pending", f.interaction)
		f.state(t, `SELECT generation_status FROM ai_media_candidates WHERE id=$1`, "generated", f.candidate)
	})
	t.Run("delete after all writes", func(t *testing.T) {
		f := newLifecycleFixture(t, "succeeded")
		f.lifecycle.workflows = failingLifecycleWorkflows{f.lifecycle.workflows}
		if err := f.lifecycle.DeleteRun(context.Background(), f.run); !errors.Is(err, errLifecycleInjected) {
			t.Fatal(err)
		}
		f.state(t, `SELECT status FROM ai_workflow_runs WHERE id=$1`, "succeeded", f.run)
		f.state(t, `SELECT status FROM ai_agent_runs WHERE id=$1`, "succeeded", f.agentRun)
		f.state(t, `SELECT status FROM workflow_interaction_tasks WHERE id=$1`, "pending", f.interaction)
		f.state(t, `SELECT generation_status FROM ai_media_candidates WHERE id=$1`, "generated", f.candidate)
	})
}
