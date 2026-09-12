package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

// StartScheduledPublisher promotes due posts. It is intentionally idempotent so
// a restart or delayed tick cannot publish the same post twice.
func StartScheduledPublisher(ctx context.Context, publisher interface {
	PublishScheduled(context.Context) (int64, error)
}, logger *zap.Logger) {
	publish := func() {
		count, err := publisher.PublishScheduled(ctx)
		if err != nil {
			logger.Error("publish scheduled posts", zap.Error(err))
			return
		}
		if count > 0 {
			logger.Info("published scheduled posts", zap.Int64("count", count))
		}
	}
	publish()
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				publish()
			}
		}
	}()
}
