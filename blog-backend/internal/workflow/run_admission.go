package workflow

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
	"strconv"

	"github.com/rushairer/blog-backend/internal/dbtx"
)

// RunAdmissionStore is consumer-owned by Workflow. It exposes only the
// persistence primitives required to atomically admit, retry, resume and
// recover Workflow runs; orchestration stays in RunAdmissionCoordinator.
type RunAdmissionStore interface {
	CreateRunTx(context.Context, *sql.Tx, *workflowdomain.WorkflowRun) (bool, error)
	LockScheduledRunTx(context.Context, *sql.Tx, int64, string) (*workflowdomain.WorkflowRun, error)
	InsertAdmissionResourcesTx(context.Context, *sql.Tx, int64, []workflowdomain.WorkflowResource) error

	RetrySource(context.Context, int64) (*workflowdomain.WorkflowRun, error)
	LockRetrySourceTx(context.Context, *sql.Tx, int64) (*workflowdomain.WorkflowRun, error)
	CountFailedIterationsTx(context.Context, *sql.Tx, int64, string, []int) (int, error)
	HasActiveRetryTx(context.Context, *sql.Tx, int64) (bool, error)
	HasConsumedRetryIterationTx(context.Context, *sql.Tx, int64, []int) (bool, error)
	CreateRetryRunTx(context.Context, *sql.Tx, *workflowdomain.WorkflowRun) error
	CopyRetryResourcesTx(context.Context, *sql.Tx, int64, int64) error
	CopyRetryQueryStepsTx(context.Context, *sql.Tx, int64, int64) error

	ListQueuedRunIDs(context.Context, int) ([]int64, error)
	ResumeUserRun(context.Context, int64) (bool, error)
}

// RunAdmissionCoordinator owns the Workflow Run consistency boundary. Run
// creation and its initial resource scope are one transaction; scheduled-run
// reuse and retry snapshots are likewise committed atomically. The repository
// remains persistence-only and never decides application policy.
type RunAdmissionCoordinator struct {
	transactor *dbtx.Transactor
	store      RunAdmissionStore
}

func NewRunAdmissionCoordinator(transactor *dbtx.Transactor, store RunAdmissionStore) *RunAdmissionCoordinator {
	if transactor == nil || store == nil {
		panic("workflow.NewRunAdmissionCoordinator: all dependencies are required")
	}
	return &RunAdmissionCoordinator{transactor: transactor, store: store}
}

func (c *RunAdmissionCoordinator) Admit(ctx context.Context, run *workflowdomain.WorkflowRun, resources []workflowdomain.WorkflowResource) (*workflowdomain.WorkflowRun, error) {
	if run == nil {
		return nil, fmt.Errorf("%w: run admission is required", ErrInvalid)
	}
	var admitted *workflowdomain.WorkflowRun
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		candidate := *run
		created, err := c.store.CreateRunTx(ctx, tx, &candidate)
		if err != nil {
			return err
		}
		if created {
			if err := c.store.InsertAdmissionResourcesTx(ctx, tx, candidate.ID, resources); err != nil {
				return err
			}
			admitted = &candidate
			return nil
		}
		if candidate.ScheduleKey == nil {
			return fmt.Errorf("run admission conflict without schedule key")
		}

		existing, err := c.store.LockScheduledRunTx(ctx, tx, candidate.WorkflowID, *candidate.ScheduleKey)
		if err != nil {
			return err
		}
		// A schedule collision returns the persisted run, never a new attempt.
		// Preserve its immutable version, input, usage and execution evidence.
		admitted = existing
		return nil
	})
	if err != nil {
		return nil, err
	}
	return admitted, nil
}

func (c *RunAdmissionCoordinator) RetrySource(ctx context.Context, runID int64) (*workflowdomain.WorkflowRun, error) {
	run, err := c.store.RetrySource(ctx, runID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return run, err
}

func (c *RunAdmissionCoordinator) Retry(ctx context.Context, runID int64, childStepID, parentStepID string, iterations []int, triggeredByPrincipalID *int64) (*workflowdomain.WorkflowRun, error) {
	var retry *workflowdomain.WorkflowRun
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		source, err := c.store.LockRetrySourceTx(ctx, tx, runID)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if source.Status != "succeeded" {
			return fmt.Errorf("%w: only a completed partial run can be retried", ErrInvalid)
		}
		if source.TriggerKind == "retry" || source.RetryOfRunID != nil {
			return fmt.Errorf("%w: retry descendants are not eligible for replay", ErrInvalid)
		}
		failed, err := c.store.CountFailedIterationsTx(ctx, tx, runID, childStepID, iterations)
		if err != nil {
			return err
		}
		if failed != len(iterations) {
			return fmt.Errorf("%w: retry can target only failed resource iterations", ErrInvalid)
		}

		// The locked source row serializes admissions across replicas. Check
		// all active retries, not just overlapping iteration selections: other
		// steps in the same Workflow may also execute in each retry Run.
		active, err := c.store.HasActiveRetryTx(ctx, tx, runID)
		if err != nil {
			return err
		}
		if active {
			return fmt.Errorf("%w: source run already has an active retry", ErrInvalid)
		}

		consumed, err := c.store.HasConsumedRetryIterationTx(ctx, tx, runID, iterations)
		if err != nil {
			return err
		}
		if consumed {
			return fmt.Errorf("%w: a selected iteration has already been admitted for retry", ErrInvalid)
		}

		parent := parentStepID
		sourceID := runID
		retry = &workflowdomain.WorkflowRun{
			WorkflowID:             source.WorkflowID,
			WorkflowVersionID:      source.WorkflowVersionID,
			DryRun:                 source.DryRun,
			Status:                 "queued",
			Input:                  source.Input,
			TriggeredByPrincipalID: triggeredByPrincipalID,
			TriggerKind:            "retry",
			SourceRef:              strconv.FormatInt(runID, 10),
			RetryOfRunID:           &sourceID,
			RetryStepID:            &parent,
			RetryIterations:        append([]int(nil), iterations...),
		}
		if err := c.store.CreateRetryRunTx(ctx, tx, retry); err != nil {
			return err
		}
		if err := c.store.CopyRetryResourcesTx(ctx, tx, runID, retry.ID); err != nil {
			return err
		}
		return c.store.CopyRetryQueryStepsTx(ctx, tx, runID, retry.ID)
	})
	if err != nil {
		return nil, err
	}
	return retry, nil
}

func (c *RunAdmissionCoordinator) QueuedRunIDs(ctx context.Context, limit int) ([]int64, error) {
	return c.store.ListQueuedRunIDs(ctx, limit)
}

func (c *RunAdmissionCoordinator) ResumeUserRun(ctx context.Context, runID int64) error {
	changed, err := c.store.ResumeUserRun(ctx, runID)
	if err != nil {
		return err
	}
	if !changed {
		return sql.ErrNoRows
	}
	return nil
}
