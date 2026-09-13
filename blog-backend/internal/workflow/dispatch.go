package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
)

type DispatchStore interface {
	AcceptEvent(context.Context, string, string, json.RawMessage) (bool, error)
	PrepareEvent(context.Context, string, int) error
	EventCooldownExists(context.Context, int64, string, int) (bool, error)
	MarkEventProcessed(context.Context, string) error
	MarkEventFailure(context.Context, string, string) error
	ClaimDueEvents(context.Context, int) ([]domain.WorkflowDispatchEvent, error)
	LockDueSchedulesTx(context.Context, *sql.Tx, int) ([]domain.WorkflowScheduleClaim, error)
	SetNextRunAtTx(context.Context, *sql.Tx, int64, *time.Time) error
}

type DispatchCoordinator struct {
	transactor *dbtx.Transactor
	store      DispatchStore
}

func NewDispatchCoordinator(transactor *dbtx.Transactor, store DispatchStore) *DispatchCoordinator {
	if transactor == nil {
		panic("workflow.NewDispatchCoordinator: transactor is required")
	}
	if store == nil {
		panic("workflow.NewDispatchCoordinator: store is required")
	}
	return &DispatchCoordinator{transactor: transactor, store: store}
}

func (c *DispatchCoordinator) AcceptEvent(ctx context.Context, eventKey, eventType string, payload json.RawMessage) (bool, error) {
	return c.store.AcceptEvent(ctx, eventKey, eventType, payload)
}

func (c *DispatchCoordinator) PrepareEvent(ctx context.Context, eventKey string, window int) error {
	return c.store.PrepareEvent(ctx, eventKey, window)
}

func (c *DispatchCoordinator) EventCoolingDown(ctx context.Context, workflowID int64, sourceRef string, seconds int) (bool, error) {
	return c.store.EventCooldownExists(ctx, workflowID, sourceRef, seconds)
}

func (c *DispatchCoordinator) MarkEventProcessed(ctx context.Context, eventKey string) error {
	return c.store.MarkEventProcessed(ctx, eventKey)
}

func (c *DispatchCoordinator) MarkEventFailure(ctx context.Context, eventKey, message string) error {
	return c.store.MarkEventFailure(ctx, eventKey, message)
}

func (c *DispatchCoordinator) ClaimDueEvents(ctx context.Context, limit int) ([]domain.WorkflowDispatchEvent, error) {
	return c.store.ClaimDueEvents(ctx, limit)
}

func (c *DispatchCoordinator) ClaimDueSchedules(ctx context.Context, limit int) ([]int64, error) {
	ids := make([]int64, 0)
	now := time.Now()
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		claims, err := c.store.LockDueSchedulesTx(ctx, tx, limit)
		if err != nil {
			return err
		}
		for _, claim := range claims {
			var nextRunAt *time.Time
			if next, nextErr := scheduledNext(claim.CronExpression, claim.Timezone, now); nextErr == nil {
				nextRunAt = &next
			}
			if err := c.store.SetNextRunAtTx(ctx, tx, claim.WorkflowID, nextRunAt); err != nil {
				return err
			}
			ids = append(ids, claim.WorkflowID)
		}
		return nil
	})
	return ids, err
}
