package workflow

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
