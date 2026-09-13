package workflow

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/rushairer/blog-backend/internal/dbtx"
)

// LifecycleWorkflowStore persists only Workflow-owned state in the caller's transaction.
type LifecycleWorkflowStore interface {
	CancelRunTx(context.Context, *sql.Tx, int64) error
	LockRunStatusTx(context.Context, *sql.Tx, int64) (string, error)
	DeleteRunTx(context.Context, *sql.Tx, int64) error
}

type LifecycleAgentRunStore interface {
	DeleteByWorkflowRunTx(context.Context, *sql.Tx, int64) error
}

type LifecycleMediaCandidateStore interface {
	CancelByWorkflowRunTx(context.Context, *sql.Tx, int64) error
	DeleteByWorkflowRunTx(context.Context, *sql.Tx, int64) error
}

// RunLifecycle owns the cross-capability cancellation/deletion transaction.
// Repositories receive the same transaction and never invoke each other.
type RunLifecycle struct {
	transactor *dbtx.Transactor
	workflows  LifecycleWorkflowStore
	runs       LifecycleAgentRunStore
	media      LifecycleMediaCandidateStore
}

func NewRunLifecycle(transactor *dbtx.Transactor, workflows LifecycleWorkflowStore, runs LifecycleAgentRunStore, media LifecycleMediaCandidateStore) *RunLifecycle {
	if transactor == nil || workflows == nil || runs == nil || media == nil {
		panic("workflow.NewRunLifecycle: all dependencies are required")
	}
	return &RunLifecycle{transactor: transactor, workflows: workflows, runs: runs, media: media}
}

func (l *RunLifecycle) Cancel(ctx context.Context, runID int64) error {
	return l.transactor.Run(ctx, func(tx *sql.Tx) error {
		if err := l.workflows.CancelRunTx(ctx, tx, runID); err != nil {
			return err
		}
		return l.media.CancelByWorkflowRunTx(ctx, tx, runID)
	})
}

func (l *RunLifecycle) DeleteRun(ctx context.Context, runID int64) error {
	return l.transactor.Run(ctx, func(tx *sql.Tx) error {
		status, err := l.workflows.LockRunStatusTx(ctx, tx, runID)
		if err != nil {
			return err
		}
		if status != "succeeded" && status != "failed" && status != "cancelled" {
			return fmt.Errorf("%w: only completed Workflow runs can be deleted", ErrInvalid)
		}
		if err := l.media.DeleteByWorkflowRunTx(ctx, tx, runID); err != nil {
			return err
		}
		if err := l.runs.DeleteByWorkflowRunTx(ctx, tx, runID); err != nil {
			return err
		}
		return l.workflows.DeleteRunTx(ctx, tx, runID)
	})
}
