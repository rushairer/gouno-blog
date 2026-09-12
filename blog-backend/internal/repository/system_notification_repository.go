package repository

import (
	"context"

	notificationrepository "github.com/rushairer/blog-backend/internal/notification/repository"
)

// Notification persistence belongs to the Notification capability. Keep this
// narrow adapter while Agent services still depend on the transitional
// AgentRepository surface.
func (r *AgentRepository) CreateSystemNotification(ctx context.Context, recipientPrincipalID int64, eventType, title, body, href, eventKey string) error {
	return notificationrepository.NewSystemNotificationRepository(r.db).Create(ctx, recipientPrincipalID, eventType, title, body, href, eventKey)
}
