package repository

import (
	"context"
)

// CreateSystemNotification records an operator-facing AI event. eventKey makes
// repeated failures for the same run idempotent.
func (r *AgentRepository) CreateSystemNotification(ctx context.Context, recipientPrincipalID int64, eventType, title, body, href, eventKey string) error {
	if recipientPrincipalID <= 0 {
		return nil
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO notifications
		(recipient_principal_id, type, post_id, actor_name, title, body, href, event_key)
		VALUES ($1,$2,NULL,'AI 运营',$3,$4,$5,$6)
		ON CONFLICT (recipient_principal_id, type, event_key) WHERE event_key IS NOT NULL DO UPDATE
		SET title=EXCLUDED.title, body=EXCLUDED.body, href=EXCLUDED.href, read_at=NULL, created_at=NOW()`,
		recipientPrincipalID, eventType, title, body, href, eventKey)
	return err
}
