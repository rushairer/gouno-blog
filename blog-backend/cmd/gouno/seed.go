package gouno

import (
	"context"
	"database/sql"
	"strings"

	"go.uber.org/zap"
)

func bootstrapDatabase(blogDB *sql.DB, logger *zap.Logger) {
	ctx := context.Background()

	logger.Info("Bootstrapping blog schema...")
	blogSchema := `
		CREATE TABLE IF NOT EXISTS posts (
			id SERIAL PRIMARY KEY,
			title VARCHAR(255) NOT NULL,
			slug VARCHAR(255) UNIQUE NOT NULL,
			summary TEXT,
			content TEXT,
			tags TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS comments (
			id SERIAL PRIMARY KEY,
			post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			author VARCHAR(100) NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`
	_, err := blogDB.ExecContext(ctx, blogSchema)
	if err != nil {
		logger.Fatal("Failed to create blog schema", zap.Error(err))
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
