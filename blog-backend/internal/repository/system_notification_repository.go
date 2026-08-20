package repository

import (
	"context"
)

// CreateSystemNotification records an operator-facing AI event. eventKey makes
// repeated failures for the same run idempotent.
func (r *AgentRepository) CreateSystemNotification(ctx context.Context, recipient, eventType, title, body, href, eventKey string) error {
	if recipient == "" {
		return nil
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO notifications
		(recipient_subject, type, post_id, actor_name, title, body, href, event_key)
		VALUES ($1,$2,NULL,'AI 工作台',$3,$4,$5,$6)
		ON CONFLICT (recipient_subject, type, event_key) WHERE event_key IS NOT NULL DO UPDATE
		SET title=EXCLUDED.title, body=EXCLUDED.body, href=EXCLUDED.href, read_at=NULL, created_at=NOW()`,
		recipient, eventType, title, body, href, eventKey)
	return err
}
