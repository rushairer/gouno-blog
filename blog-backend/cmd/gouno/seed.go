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
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			published_at TIMESTAMPTZ,
			scheduled_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS comments (
			id SERIAL PRIMARY KEY,
			post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			author VARCHAR(100) NOT NULL,
			content TEXT NOT NULL,
			is_visible BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT false;
		CREATE TABLE IF NOT EXISTS blog_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
	`
	_, err := blogDB.ExecContext(ctx, blogSchema)
	if err != nil {
		logger.Fatal("Failed to create blog schema", zap.Error(err))
	}
	if _, err := blogDB.ExecContext(ctx, `ALTER TABLE posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'; ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ; ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;`); err != nil {
		logger.Fatal("Failed to migrate post schema", zap.Error(err))
	}
	result, err := blogDB.ExecContext(ctx, `INSERT INTO blog_schema_migrations (version) VALUES ('post-publication-workflow-v1') ON CONFLICT DO NOTHING`)
	if err != nil {
		logger.Fatal("Failed to record post migration", zap.Error(err))
	}
	if rows, _ := result.RowsAffected(); rows == 1 {
		if _, err := blogDB.ExecContext(ctx, `UPDATE posts SET status = 'published', published_at = created_at WHERE status = 'draft' AND published_at IS NULL`); err != nil {
			logger.Fatal("Failed to backfill published posts", zap.Error(err))
		}
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
