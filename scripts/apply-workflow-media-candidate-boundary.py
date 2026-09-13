from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


# 1. Consumer-side coordinator ports and explicit Service dependency.
service = "blog-backend/internal/workflow/service.go"
replace_once(
    service,
    "\tworkerSem   chan struct{}\n\tlifecycle   *RunLifecycle\n}",
    "\tworkerSem   chan struct{}\n\tlifecycle   *RunLifecycle\n\tmediaRuns   *MediaRunCoordinator\n}",
)
replace_once(
    service,
    "func NewService(db *sql.DB, runner *agentservice.Runner, agents *agentservice.ManagementService, registry *tool.Registry, lifecycle *RunLifecycle) *Service {\n\tif lifecycle == nil {\n\t\tpanic(\"workflow.NewService: lifecycle is required\")\n\t}\n\treturn &Service{db: db, definitions: workflowrepository.NewDefinitionRepository(db), runner: runner, agents: agents, tools: registry, catalog: NewResourceCatalog(db), workerSem: make(chan struct{}, 4), lifecycle: lifecycle}\n}",
    "func NewService(db *sql.DB, runner *agentservice.Runner, agents *agentservice.ManagementService, registry *tool.Registry, lifecycle *RunLifecycle, mediaRuns *MediaRunCoordinator) *Service {\n\tif lifecycle == nil {\n\t\tpanic(\"workflow.NewService: lifecycle is required\")\n\t}\n\tif mediaRuns == nil {\n\t\tpanic(\"workflow.NewService: media run coordinator is required\")\n\t}\n\treturn &Service{db: db, definitions: workflowrepository.NewDefinitionRepository(db), runner: runner, agents: agents, tools: registry, catalog: NewResourceCatalog(db), workerSem: make(chan struct{}, 4), lifecycle: lifecycle, mediaRuns: mediaRuns}\n}",
)
replace_once(
    service,
    "func (s *Service) ResumeAfterApproval(ctx context.Context, runID int64) error {\n\tresult, err := s.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='queued',finished_at=NULL,error_code=NULL,error_message=NULL\n\t\tWHERE id=$1 AND status='awaiting_approval'\n\t\tAND NOT EXISTS (SELECT 1 FROM ai_media_candidates WHERE workflow_run_id=$1)`, runID)\n\tif err != nil {\n\t\treturn err\n\t}\n\tif changed, _ := result.RowsAffected(); changed == 0 {\n\t\treturn sql.ErrNoRows\n\t}\n\tgo s.Execute(context.Background(), runID)\n\treturn nil\n}\n\n// ReconcileMediaRun reflects the persisted image-task lifecycle in its source\n// Workflow. It is called after every user-visible image operation.\nfunc (s *Service) ReconcileMediaRun(ctx context.Context, runID int64) error {\n\tvar total, pending, applied, failed, cancelled int\n\tif err := s.db.QueryRowContext(ctx, `SELECT COUNT(*),\n\t\tCOUNT(*) FILTER (WHERE applied_version_id IS NULL AND generation_status NOT IN ('rejected','failed','cancelled')),\n\t\tCOUNT(*) FILTER (WHERE applied_version_id IS NOT NULL),\n\t\tCOUNT(*) FILTER (WHERE generation_status IN ('failed','rejected')),\n\t\tCOUNT(*) FILTER (WHERE generation_status='cancelled')\n\t\tFROM ai_media_candidates WHERE workflow_run_id=$1`, runID).Scan(&total, &pending, &applied, &failed, &cancelled); err != nil {\n\t\treturn err\n\t}\n\tif total == 0 {\n\t\treturn nil\n\t}\n\tstatus := \"waiting_for_user\"\n\tfinished := false\n\tif pending == 0 && applied > 0 {\n\t\tstatus, finished = \"succeeded\", true\n\t} else if pending == 0 {\n\t\tstatus, finished = \"cancelled\", true\n\t}\n\tresult, err := s.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2,finished_at=CASE WHEN $3 THEN NOW() ELSE NULL END\n\t\tWHERE id=$1 AND status NOT IN ('failed','cancelled','succeeded')`, runID, status, finished)\n\tif err != nil {\n\t\treturn err\n\t}\n\tif changed, _ := result.RowsAffected(); changed == 0 {\n\t\tvar exists bool\n\t\tif err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs WHERE id=$1)`, runID).Scan(&exists); err != nil || !exists {\n\t\t\treturn ErrNotFound\n\t\t}\n\t}\n\treturn nil\n}",
    "func (s *Service) ResumeAfterApproval(ctx context.Context, runID int64) error {\n\tif err := s.mediaRuns.ResumeAfterApproval(ctx, runID); err != nil {\n\t\treturn err\n\t}\n\tgo s.Execute(context.Background(), runID)\n\treturn nil\n}\n\n// ReconcileMediaRun reflects the persisted image-task lifecycle in its source\n// Workflow. Cross-capability reads are coordinated through MediaRunCoordinator.\nfunc (s *Service) ReconcileMediaRun(ctx context.Context, runID int64) error {\n\treturn s.mediaRuns.Reconcile(ctx, runID)\n}",
)
replace_once(
    service,
    "\t} else {\n\t\tvar pendingMedia int\n\t\tif queryErr := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_media_candidates WHERE workflow_run_id=$1 AND applied_version_id IS NULL AND generation_status NOT IN ('rejected','failed','cancelled')`, runID).Scan(&pendingMedia); queryErr == nil && pendingMedia > 0 {\n\t\t\tstatus = \"waiting_for_user\"\n\t\t}\n\t}",
    "\t} else if pendingMedia, queryErr := s.mediaRuns.HasPending(ctx, runID); queryErr == nil && pendingMedia {\n\t\tstatus = \"waiting_for_user\"\n\t}",
)

# 2. Remove the Workflow repository's Agent-owned lookup and move orchestration to ApprovalService.
interaction_repo = "blog-backend/internal/workflow/repository/interaction_repository.go"
replace_once(
    interaction_repo,
    "\nfunc (r *InteractionRepository) ListMediaCandidateEvents(ctx context.Context, candidateID int64) ([]*domain.WorkflowRunEvent, error) {\n\tvar runID sql.NullInt64\n\tif err := r.db.QueryRowContext(ctx, `SELECT workflow_run_id FROM ai_media_candidates WHERE id=$1`, candidateID).Scan(&runID); err != nil {\n\t\treturn nil, err\n\t}\n\tif !runID.Valid {\n\t\treturn []*domain.WorkflowRunEvent{}, nil\n\t}\n\treturn r.ListWorkflowRunEvents(ctx, runID.Int64)\n}\n",
    "\n",
)
replace_once(
    "blog-backend/internal/agent/approval_ports.go",
    "\tListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)\n\tListMediaCandidateEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)\n",
    "\tListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error)\n",
)
replace_once(
    "blog-backend/internal/agent/approval.go",
    "func (s *ApprovalService) ListMediaCandidateEvents(ctx context.Context, id int64) ([]*domain.WorkflowRunEvent, error) {\n\treturn s.workflowEvents.ListMediaCandidateEvents(ctx, id)\n}",
    "func (s *ApprovalService) ListMediaCandidateEvents(ctx context.Context, id int64) ([]*domain.WorkflowRunEvent, error) {\n\tcandidate, err := s.mediaCandidates.GetMediaCandidate(ctx, id)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tif candidate.WorkflowRunID == nil {\n\t\treturn []*domain.WorkflowRunEvent{}, nil\n\t}\n\treturn s.workflowEvents.ListWorkflowRunEvents(ctx, *candidate.WorkflowRunID)\n}",
)

# 3. Explicit composition-root wiring.
replace_once(
    "blog-backend/cmd/gouno/web.go",
    "\t\tworkflowLifecycleRepo := workflowrepository.NewRunLifecycleRepository()\n\t\tworkflowLifecycle := workflowservice.NewRunLifecycle(transactor, workflowLifecycleRepo, agentRunRepo, agentMediaCandidateRepo)\n\t\tworkflowSvc := workflowservice.NewService(cfg.DB, runner, management, toolRegistry, workflowLifecycle)\n",
    "\t\tworkflowLifecycleRepo := workflowrepository.NewRunLifecycleRepository()\n\t\tworkflowLifecycle := workflowservice.NewRunLifecycle(transactor, workflowLifecycleRepo, agentRunRepo, agentMediaCandidateRepo)\n\t\tworkflowMediaRunRepo := workflowrepository.NewMediaRunRepository()\n\t\tworkflowMediaRuns := workflowservice.NewMediaRunCoordinator(transactor, workflowMediaRunRepo, agentMediaCandidateRepo)\n\t\tworkflowSvc := workflowservice.NewService(cfg.DB, runner, management, toolRegistry, workflowLifecycle, workflowMediaRuns)\n",
)

# 4. Canonical Agent-owned read ports and Workflow-owned write repository.
write(
    "blog-backend/internal/agent/repository/media_candidate_workflow_state.go",
    '''package repository

import (
    "context"
    "database/sql"
)

// HasWorkflowRunCandidatesTx answers a Workflow coordinator question while
// keeping Media Candidate persistence ownership inside the Agent capability.
func (r *MediaCandidateRepository) HasWorkflowRunCandidatesTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
    var exists bool
    err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_media_candidates WHERE workflow_run_id=$1)`, runID).Scan(&exists)
    return exists, err
}

// WorkflowRunCandidateSummaryTx returns only the aggregate state needed by the
// Workflow coordinator; callers never query Agent-owned rows directly.
func (r *MediaCandidateRepository) WorkflowRunCandidateSummaryTx(ctx context.Context, tx *sql.Tx, runID int64) (total, pending, applied, failed, cancelled int, err error) {
    err = tx.QueryRowContext(ctx, `SELECT COUNT(*),
        COUNT(*) FILTER (WHERE applied_version_id IS NULL AND generation_status NOT IN ('rejected','failed','cancelled')),
        COUNT(*) FILTER (WHERE applied_version_id IS NOT NULL),
        COUNT(*) FILTER (WHERE generation_status IN ('failed','rejected')),
        COUNT(*) FILTER (WHERE generation_status='cancelled')
        FROM ai_media_candidates WHERE workflow_run_id=$1`, runID).
        Scan(&total, &pending, &applied, &failed, &cancelled)
    return
}

func (r *MediaCandidateRepository) HasPendingWorkflowRunCandidates(ctx context.Context, runID int64) (bool, error) {
    var pending bool
    err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_media_candidates
        WHERE workflow_run_id=$1 AND applied_version_id IS NULL
        AND generation_status NOT IN ('rejected','failed','cancelled'))`, runID).Scan(&pending)
    return pending, err
}
''',
)
write(
    "blog-backend/internal/workflow/repository/media_run_repository.go",
    '''package repository

import (
    "context"
    "database/sql"
)

// MediaRunRepository owns only Workflow Run persistence used by the
// cross-capability media/run coordinator. Transactions are supplied by the
// application coordinator and are never started here.
type MediaRunRepository struct{}

func NewMediaRunRepository() *MediaRunRepository { return &MediaRunRepository{} }

func (r *MediaRunRepository) ResumeAfterApprovalTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
    result, err := tx.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='queued',finished_at=NULL,error_code=NULL,error_message=NULL
        WHERE id=$1 AND status='awaiting_approval'`, runID)
    if err != nil {
        return false, err
    }
    changed, err := result.RowsAffected()
    return changed > 0, err
}

func (r *MediaRunRepository) SetMediaRunStateTx(ctx context.Context, tx *sql.Tx, runID int64, status string, finished bool) (bool, error) {
    result, err := tx.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2,finished_at=CASE WHEN $3 THEN NOW() ELSE NULL END
        WHERE id=$1 AND status NOT IN ('failed','cancelled','succeeded')`, runID, status, finished)
    if err != nil {
        return false, err
    }
    changed, err := result.RowsAffected()
    return changed > 0, err
}

func (r *MediaRunRepository) RunExistsTx(ctx context.Context, tx *sql.Tx, runID int64) (bool, error) {
    var exists bool
    err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs WHERE id=$1)`, runID).Scan(&exists)
    return exists, err
}
''',
)
write(
    "blog-backend/internal/workflow/media_run_coordinator.go",
    '''package workflow

import (
    "context"
    "database/sql"

    "github.com/rushairer/blog-backend/internal/dbtx"
)

// MediaCandidateRunStore is consumer-owned by Workflow. Agent persistence
// implements it without exposing its broader MediaCandidateRepository surface.
type MediaCandidateRunStore interface {
    HasWorkflowRunCandidatesTx(context.Context, *sql.Tx, int64) (bool, error)
    WorkflowRunCandidateSummaryTx(context.Context, *sql.Tx, int64) (int, int, int, int, int, error)
    HasPendingWorkflowRunCandidates(context.Context, int64) (bool, error)
}

type MediaWorkflowRunStore interface {
    ResumeAfterApprovalTx(context.Context, *sql.Tx, int64) (bool, error)
    SetMediaRunStateTx(context.Context, *sql.Tx, int64, string, bool) (bool, error)
    RunExistsTx(context.Context, *sql.Tx, int64) (bool, error)
}

// MediaRunCoordinator owns Workflow/Agent coordination for Media Candidate
// state. Repositories remain persistence-only and share the caller-owned
// transaction when a cross-capability decision and Workflow write must agree.
type MediaRunCoordinator struct {
    transactor *dbtx.Transactor
    workflows  MediaWorkflowRunStore
    candidates MediaCandidateRunStore
}

func NewMediaRunCoordinator(transactor *dbtx.Transactor, workflows MediaWorkflowRunStore, candidates MediaCandidateRunStore) *MediaRunCoordinator {
    if transactor == nil || workflows == nil || candidates == nil {
        panic("workflow.NewMediaRunCoordinator: all dependencies are required")
    }
    return &MediaRunCoordinator{transactor: transactor, workflows: workflows, candidates: candidates}
}

func (c *MediaRunCoordinator) ResumeAfterApproval(ctx context.Context, runID int64) error {
    return c.transactor.Run(ctx, func(tx *sql.Tx) error {
        hasCandidates, err := c.candidates.HasWorkflowRunCandidatesTx(ctx, tx, runID)
        if err != nil {
            return err
        }
        if hasCandidates {
            return sql.ErrNoRows
        }
        changed, err := c.workflows.ResumeAfterApprovalTx(ctx, tx, runID)
        if err != nil {
            return err
        }
        if !changed {
            return sql.ErrNoRows
        }
        return nil
    })
}

func (c *MediaRunCoordinator) Reconcile(ctx context.Context, runID int64) error {
    return c.transactor.Run(ctx, func(tx *sql.Tx) error {
        total, pending, applied, _, _, err := c.candidates.WorkflowRunCandidateSummaryTx(ctx, tx, runID)
        if err != nil {
            return err
        }
        if total == 0 {
            return nil
        }

        status, finished := "waiting_for_user", false
        if pending == 0 && applied > 0 {
            status, finished = "succeeded", true
        } else if pending == 0 {
            status, finished = "cancelled", true
        }

        changed, err := c.workflows.SetMediaRunStateTx(ctx, tx, runID, status, finished)
        if err != nil {
            return err
        }
        if changed {
            return nil
        }
        exists, err := c.workflows.RunExistsTx(ctx, tx, runID)
        if err != nil || !exists {
            if err != nil {
                return err
            }
            return ErrNotFound
        }
        return nil
    })
}

func (c *MediaRunCoordinator) HasPending(ctx context.Context, runID int64) (bool, error) {
    return c.candidates.HasPendingWorkflowRunCandidates(ctx, runID)
}
''',
)

# 5. Regression coverage: coordinator behavior, transaction rollback, and ownership guard.
write(
    "blog-backend/internal/workflow/media_run_coordinator_integration_test.go",
    '''package workflow

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
''',
)
write(
    "blog-backend/internal/workflow/ownership_test.go",
    '''package workflow

import (
    "bytes"
    "io/fs"
    "os"
    "path/filepath"
    "strings"
    "testing"
)

func TestWorkflowProductionCodeDoesNotQueryAgentOwnedMediaCandidates(t *testing.T) {
    err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
        if err != nil {
            return err
        }
        if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
            return nil
        }
        data, err := os.ReadFile(path)
        if err != nil {
            return err
        }
        if bytes.Contains(data, []byte("ai_media_candidates")) {
            t.Errorf("%s queries Agent-owned ai_media_candidates directly", path)
        }
        return nil
    })
    if err != nil {
        t.Fatal(err)
    }
}
''',
)

# Existing integration tests that construct Service directly need the canonical coordinator.
resource_test = "blog-backend/internal/workflow/resource_query_integration_test.go"
resource_content = read(resource_test)
resource_content, n = re.subn(r"&Service\{db: db, ", "&Service{db: db, mediaRuns: newTestMediaRunCoordinator(db), ", resource_content)
if n == 0:
    raise SystemExit(f"{resource_test}: expected direct Service fixtures")
write(resource_test, resource_content)

# Approval unit tests follow candidate ownership when resolving candidate events.
approval_test = "blog-backend/internal/agent/approval_test.go"
approval_test_content = read(approval_test)
approval_test_content = approval_test_content.replace(
    "type workflowEventStub struct {\n\tevents    []*domain.WorkflowRunEvent\n\tappendErr error\n}",
    "type workflowEventStub struct {\n\tevents        []*domain.WorkflowRunEvent\n\tappendErr     error\n\tlisted        []*domain.WorkflowRunEvent\n\tlistErr       error\n\tlastListRunID int64\n}",
    1,
)
approval_test_content = approval_test_content.replace(
    "func (s *workflowEventStub) ListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {\n\treturn nil, nil\n}\nfunc (s *workflowEventStub) ListMediaCandidateEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {\n\treturn nil, nil\n}\n",
    "func (s *workflowEventStub) ListWorkflowRunEvents(_ context.Context, runID int64) ([]*domain.WorkflowRunEvent, error) {\n\ts.lastListRunID = runID\n\treturn s.listed, s.listErr\n}\n",
    1,
)
approval_test_content += '''\n\ntype mediaCandidateLookupStub struct {\n\tMediaCandidateStore\n\tcandidate *domain.MediaCandidate\n\terr       error\n}\n\nfunc (s *mediaCandidateLookupStub) GetMediaCandidate(context.Context, int64) (*domain.MediaCandidate, error) {\n\treturn s.candidate, s.err\n}\n\nfunc TestListMediaCandidateEventsResolvesCandidateThroughAgentStore(t *testing.T) {\n\trunID := int64(73)\n\twant := []*domain.WorkflowRunEvent{{ID: 9}}\n\tevents := &workflowEventStub{listed: want}\n\tsvc := &ApprovalService{\n\t\tmediaCandidates: &mediaCandidateLookupStub{candidate: &domain.MediaCandidate{WorkflowRunID: &runID}},\n\t\tworkflowEvents:  events,\n\t}\n\tgot, err := svc.ListMediaCandidateEvents(context.Background(), 5)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif events.lastListRunID != runID || len(got) != 1 || got[0].ID != 9 {\n\t\tt.Fatalf("run=%d events=%#v", events.lastListRunID, got)\n\t}\n}\n\nfunc TestListMediaCandidateEventsWithoutWorkflowRunIsEmpty(t *testing.T) {\n\tevents := &workflowEventStub{}\n\tsvc := &ApprovalService{\n\t\tmediaCandidates: &mediaCandidateLookupStub{candidate: &domain.MediaCandidate{}},\n\t\tworkflowEvents:  events,\n\t}\n\tgot, err := svc.ListMediaCandidateEvents(context.Background(), 5)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif len(got) != 0 || events.lastListRunID != 0 {\n\t\tt.Fatalf("run=%d events=%#v", events.lastListRunID, got)\n\t}\n}\n'''
write(approval_test, approval_test_content)

# 6. Architecture source of truth records the discovered drift and its exit condition.
arch = "blog-backend/ARCHITECTURE.md"
arch_content = read(arch)
marker = "## Workflow cancellation and deletion\n"
if marker not in arch_content:
    raise SystemExit(f"{arch}: workflow lifecycle marker not found")
media_section = '''## Workflow / Agent Media Candidate boundary\n\n`ai_media_candidates` is Agent-owned persistence. Workflow code must not query that table directly.\nWorkflow run resumption/reconciliation uses `MediaRunCoordinator`, which owns the cross-capability transaction through `dbtx.Transactor`: Agent's Media Candidate repository supplies only consumer-sized tx-aware state reads, while Workflow's `MediaRunRepository` writes only `ai_workflow_runs`. Candidate-event lookup is orchestrated by Agent ApprovalService: it resolves the candidate through the Agent store, then calls Workflow's run-event port with the resolved Workflow Run ID.\n\nThis boundary is guarded by tests so Workflow production packages cannot reintroduce direct `ai_media_candidates` SQL.\n\n'''
if "## Workflow / Agent Media Candidate boundary" not in arch_content:
    arch_content = arch_content.replace(marker, media_section + marker, 1)
write(arch, arch_content)

conv = "blog-backend/ARCHITECTURE_CONVERGENCE.md"
conv_content = read(conv)
conv_content = conv_content.replace(
    "`RunLifecycle` owns cancellation/deletion; `Service.RetryFailed` owns the raw transaction that copies Workflow run/resources/steps.",
    "`RunLifecycle` owns cancellation/deletion; `MediaRunCoordinator` owns Agent Media Candidate read + Workflow Run write transactions for approval resume/reconciliation; `Service.RetryFailed` owns the raw transaction that copies Workflow run/resources/steps.",
)
conv_content = conv_content.replace(
    "- **Workflow:** `RunLifecycle` owns cancellation/deletion; `Service.RetryFailed` owns the raw transaction that copies Workflow run/resources/steps.",
    "- **Workflow:** `RunLifecycle` owns cancellation/deletion. `MediaRunCoordinator` owns the cross-capability transaction for Agent Media Candidate state reads plus Workflow Run status writes, and the execution path asks that coordinator for pending-media state instead of querying Agent tables. `Service.RetryFailed` still owns the raw transaction that copies Workflow run/resources/steps.",
)
completed_marker = "## Completed convergence slices\n"
if completed_marker not in conv_content:
    raise SystemExit(f"{conv}: completed slice marker not found")
completed_entry = "- **Agent MediaCandidate / Workflow Run boundary:** Workflow no longer queries `ai_media_candidates` from Service or repository code. `MediaRunCoordinator` owns approval-resume/reconciliation transactions using Agent tx-aware candidate reads plus Workflow-owned Run writes; ApprovalService resolves candidate-to-run event lookup through the Agent store before calling the Workflow run-event port. Composition root wires canonical repositories directly; no compatibility facade was introduced.\n"
if completed_entry not in conv_content:
    conv_content = conv_content.replace(completed_marker, completed_marker + "\n" + completed_entry, 1)
write(conv, conv_content)

# The current branch audit baseline remains historical evidence; record this branch explicitly as active work.
audit = "blog-backend/ARCHITECTURE_BRANCH_AUDIT.md"
audit_content = read(audit)
active_note = "\n> Active convergence work after this audit: `refactor/workflow-media-candidate-boundary` was created from current `main` to remove direct Workflow reads of Agent-owned Media Candidate persistence. It is not a historical branch and must be judged by its PR/CI before merge.\n"
if "refactor/workflow-media-candidate-boundary" not in audit_content:
    first_break = audit_content.find("\n\n")
    audit_content = audit_content[:first_break] + active_note + audit_content[first_break:]
write(audit, audit_content)

# Fail closed: no Workflow production Go file may still carry the Agent-owned table name.
for path in (ROOT / "blog-backend/internal/workflow").rglob("*.go"):
    if path.name.endswith("_test.go"):
        continue
    if "ai_media_candidates" in path.read_text():
        raise SystemExit(f"ownership violation remains in {path.relative_to(ROOT)}")

print("workflow media candidate boundary refactor applied")
