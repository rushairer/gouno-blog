package agent

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
)

type RunLifecycle struct {
	transactor *dbtx.Transactor
	runs       RunLifecycleRunStore
	media      RunLifecycleMediaStore
}

func NewRunLifecycle(transactor *dbtx.Transactor, runs RunLifecycleRunStore, media RunLifecycleMediaStore) *RunLifecycle {
	return &RunLifecycle{transactor: transactor, runs: runs, media: media}
}

func (l *RunLifecycle) FinishRun(ctx context.Context, id int64, status domain.AgentRunStatus, summary string, inputTokens, outputTokens int64, errorCode, errorMessage *string) error {
	if err := l.runs.FinishRun(ctx, id, status, summary, inputTokens, outputTokens, errorCode, errorMessage); err != nil {
		return err
	}
	return l.media.SyncRunTokenUsage(ctx, id, inputTokens, outputTokens)
}

func (l *RunLifecycle) DeleteRun(ctx context.Context, runID int64) error {
	return l.transactor.Run(ctx, func(tx *sql.Tx) error {
		status, err := l.runs.LockRunStatus(ctx, tx, runID)
		if err != nil {
			return err
		}
		if status != domain.AgentRunSucceeded && status != domain.AgentRunFailed && status != domain.AgentRunCancelled {
			return errors.New("only completed Agent runs can be deleted")
		}
		if err := l.media.DeleteBySourceRunTx(ctx, tx, runID); err != nil {
			return err
		}
		return l.runs.DeleteRunTx(ctx, tx, runID)
	})
}
