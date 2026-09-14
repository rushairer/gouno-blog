package repository

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

type Repository interface {
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	GetVersionTx(context.Context, *sql.Tx, int64, int64) (*domain.PostVersion, error)
}

type PostgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &PostgresRepository{db: db}
}

type rowScanner interface {
	Scan(...any) error
}

func scanVersion(scanner rowScanner) (*domain.PostVersion, error) {
	var version domain.PostVersion
	err := scanner.Scan(&version.ID, &version.PostID, &version.Title, &version.Slug, &version.Summary,
		&version.Content, pq.Array(&version.Tags), &version.CategoryID, &version.CoverURL, &version.CoverAlt,
		&version.SEOTitle, &version.SEODescription, &version.Status, &version.PublishedAt,
		&version.ScheduledAt, &version.CreatedAt)
	return &version, err
}

func (r *PostgresRepository) ListVersions(ctx context.Context, postID int64) ([]*domain.PostVersion, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, post_id, title, slug, summary, content, tags, category_id,
		COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''), status,
		published_at, scheduled_at, created_at
		FROM post_versions WHERE post_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make([]*domain.PostVersion, 0)
	for rows.Next() {
		version, err := scanVersion(rows)
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	return versions, rows.Err()
}

// GetVersionTx reads and locks the PostVersion-owned snapshot in the
// coordinator's transaction. It never writes Post-owned state.
func (r *PostgresRepository) GetVersionTx(ctx context.Context, tx *sql.Tx, postID, versionID int64) (*domain.PostVersion, error) {
	return scanVersion(tx.QueryRowContext(ctx, `SELECT id, post_id, title, slug, summary, content, tags, category_id,
		COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''), status,
		published_at, scheduled_at, created_at
		FROM post_versions WHERE post_id = $1 AND id = $2 FOR SHARE`, postID, versionID))
}
