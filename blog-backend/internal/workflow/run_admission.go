package workflow

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
)

// RunAdmissionStore is consumer-owned by Workflow. It exposes only the
// persistence primitives required to atomically admit, retry, resume and
// recover Workflow runs; orchestration stays in RunAdmissionCoordinator.
type RunAdmissionStore interface {
	CreateRunTx(context.Context, *sql.Tx, *domain.WorkflowRun) (bool, error)
	LockScheduledRunTx(context.Context, *sql.Tx, int64, string) (*domain.WorkflowRun, error)
	RequeueFailedScheduledRunTx(context.Context, *sql.Tx, *domain.WorkflowRun) (bool, error)
	InsertAdmissionResourcesTx(context.Context, *sql.Tx, int64, []domain.WorkflowResource) error
	ReplaceNonQueryResourcesTx(context.Context, *sql.Tx, int64, []domain.WorkflowResource) error

	RetrySource(context.Context, int64) (*domain.WorkflowRun, error)
	LockRetrySourceTx(context.Context, *sql.Tx, int64) (*domain.WorkflowRun, error)
	CountFailedIterationsTx(context.Context, *sql.Tx, int64, string, []int) (int, error)
	CreateRetryRunTx(context.Context, *sql.Tx, *domain.WorkflowRun) error
	CopyRetryResourcesTx(context.Context, *sql.Tx, int64, int64) error
	CopyRetryQueryStepsTx(context.Context, *sql.Tx, int64, int64) error

	RecoverInterrupted(context.Context) error
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

func (c *RunAdmissionCoordinator) Admit(ctx context.Context, run *domain.WorkflowRun, resources []domain.WorkflowResource, retryFailed bool) (*domain.WorkflowRun, error) {
	if run == nil {
		return nil, fmt.Errorf("%w: run admission is required", ErrInvalid)
	}
	var admitted *domain.WorkflowRun
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
		candidate.ID, candidate.Status, candidate.CreatedAt = existing.ID, existing.Status, existing.CreatedAt
		if existing.Status == "failed" && retryFailed {
			changed, err := c.store.RequeueFailedScheduledRunTx(ctx, tx, &candidate)
			if err != nil {
				return err
			}
			if !changed {
				return sql.ErrNoRows
			}
			candidate.Status = "queued"
			if err := c.store.ReplaceNonQueryResourcesTx(ctx, tx, candidate.ID, resources); err != nil {
				return err
			}
		}
		admitted = &candidate
		return nil
	})
	if err != nil {
		return nil, err
	}
	return admitted, nil
}

func (c *RunAdmissionCoordinator) RetrySource(ctx context.Context, runID int64) (*domain.WorkflowRun, error) {
	run, err := c.store.RetrySource(ctx, runID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return run, err
}

func (c *RunAdmissionCoordinator) Retry(ctx context.Context, runID int64, childStepID, parentStepID string, iterations []int, triggeredByPrincipalID *int64) (*domain.WorkflowRun, error) {
	var retry *domain.WorkflowRun
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
		failed, err := c.store.CountFailedIterationsTx(ctx, tx, runID, childStepID, iterations)
		if err != nil {
			return err
		}
		if failed != len(iterations) {
			return fmt.Errorf("%w: retry can target only failed resource iterations", ErrInvalid)
		}

		parent := parentStepID
		sourceID := runID
		retry = &domain.WorkflowRun{
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

func (c *RunAdmissionCoordinator) RecoverInterrupted(ctx context.Context) error {
	return c.store.RecoverInterrupted(ctx)
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
