package gouno

import (
	"context"
	"database/sql"
	"strings"

	"github.com/rushairer/blog-backend/internal/migrations"
	"go.uber.org/zap"
)

func bootstrapDatabase(blogDB *sql.DB, logger *zap.Logger) {
	ctx := context.Background()

	logger.Info("Applying blog schema migrations...")
	if err := migrations.Up(ctx, blogDB); err != nil {
		logger.Fatal("Failed to migrate blog schema", zap.Error(err))
	}
	logger.Info("Blog schema is ready.")
}

func maskDSN(dsn string) string {
	parts := strings.Split(dsn, " ")
	for i, part := range parts {
		if strings.HasPrefix(part, "password=") {
			parts[i] = "password=*****"
		}
	}
	return strings.Join(parts, " ")
}
