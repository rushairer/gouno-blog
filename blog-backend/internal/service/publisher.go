package service

import (
	"context"

	postservice "github.com/rushairer/blog-backend/internal/post/service"
	"go.uber.org/zap"
)

func StartScheduledPublisher(ctx context.Context, publisher interface {
	PublishScheduled(context.Context) (int64, error)
}, logger *zap.Logger) {
	postservice.StartScheduledPublisher(ctx, publisher, logger)
}
