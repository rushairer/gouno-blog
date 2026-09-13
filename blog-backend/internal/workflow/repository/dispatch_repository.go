package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

type DispatchRepository struct {
	db *sql.DB
}

func NewDispatchRepository(db *sql.DB) *DispatchRepository {
	if db == nil {
		panic("workflow repository.NewDispatchRepository: db is required")
	}
	return &DispatchRepository{db: db}
}

func (r *DispatchRepository) AcceptEvent(ctx context.Context, eventKey, eventType string, payload json.RawMessage) (bool, error) {
	var inserted bool
	err := r.db.QueryRowContext(ctx, `INSERT INTO ai_workflow_events(event_key,event_type,payload) VALUES($1,$2,$3)
        ON CONFLICT (event_key) DO NOTHING RETURNING TRUE`, eventKey, eventType, payload).Scan(&inserted)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return inserted, err
}

func (r *DispatchRepository) PrepareEvent(ctx context.Context, eventKey string, window int) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_events SET batch_prepared=TRUE,available_at=NOW()+make_interval(secs=>CASE WHEN $2=0 THEN 30 ELSE $2 END)
        WHERE event_key=$1 AND status='accepted' AND batch_prepared=FALSE`, eventKey, window)
	return err
}

func (r *DispatchRepository) EventCooldownExists(ctx context.Context, workflowID int64, sourceRef string, seconds int) (bool, error) {
	var recent bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs WHERE workflow_id=$1 AND trigger_kind='event' AND source_ref=$2 AND created_at >= NOW()-make_interval(secs=>$3))`, workflowID, sourceRef, seconds).Scan(&recent)
	return recent, err
}

func (r *DispatchRepository) MarkEventProcessed(ctx context.Context, eventKey string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_events SET status='processed',processed_at=NOW() WHERE event_key=$1`, eventKey)
	return err
}

func (r *DispatchRepository) MarkEventFailure(ctx context.Context, eventKey, message string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE ai_workflow_events
        SET attempts=attempts+1,last_error=$2,available_at=NOW()+make_interval(secs=>LEAST(3600,POWER(2,attempts)))
        WHERE event_key=$1 AND status='accepted'`, eventKey, message)
	return err
}

func (r *DispatchRepository) ClaimDueEvents(ctx context.Context, limit int) ([]domain.WorkflowDispatchEvent, error) {
	rows, err := r.db.QueryContext(ctx, `WITH due AS (
        SELECT id FROM ai_workflow_events
        WHERE status='accepted' AND available_at<=NOW()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
    )
    UPDATE ai_workflow_events e
    SET available_at=NOW()+INTERVAL '30 seconds'
    FROM due WHERE e.id=due.id
    RETURNING e.event_key,e.event_type,e.payload,e.batch_prepared`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.WorkflowDispatchEvent, 0)
	for rows.Next() {
		var item domain.WorkflowDispatchEvent
		if err := rows.Scan(&item.EventKey, &item.EventType, &item.Payload, &item.BatchPrepared); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *DispatchRepository) LockDueSchedulesTx(ctx context.Context, tx *sql.Tx, limit int) ([]domain.WorkflowScheduleClaim, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,cron_expression,timezone FROM ai_workflows
        WHERE enabled=TRUE AND cron_expression IS NOT NULL AND next_run_at<=NOW() AND deleted_at IS NULL
        ORDER BY next_run_at,id LIMIT $1 FOR UPDATE SKIP LOCKED`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.WorkflowScheduleClaim, 0)
	for rows.Next() {
		var item domain.WorkflowScheduleClaim
		if err := rows.Scan(&item.WorkflowID, &item.CronExpression, &item.Timezone); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *DispatchRepository) SetNextRunAtTx(ctx context.Context, tx *sql.Tx, workflowID int64, nextRunAt *time.Time) error {
	_, err := tx.ExecContext(ctx, `UPDATE ai_workflows SET next_run_at=$2,updated_at=NOW() WHERE id=$1`, workflowID, nextRunAt)
	return err
}
