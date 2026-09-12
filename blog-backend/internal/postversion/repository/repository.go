package repository

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

type Repository interface {
	ListVersions(context.Context, int64) ([]*domain.PostVersion, error)
	RestoreVersion(context.Context, int64, int64) (*domain.Post, error)
}

type PostgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &PostgresRepository{db: db}
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
		var version domain.PostVersion
		if err := rows.Scan(&version.ID, &version.PostID, &version.Title, &version.Slug, &version.Summary,
			&version.Content, pq.Array(&version.Tags), &version.CategoryID, &version.CoverURL, &version.CoverAlt,
			&version.SEOTitle, &version.SEODescription, &version.Status, &version.PublishedAt,
			&version.ScheduledAt, &version.CreatedAt); err != nil {
			return nil, err
		}
		versions = append(versions, &version)
	}
	return versions, rows.Err()
}

const postColumns = `p.id, p.title, p.slug, p.summary, p.content, p.tags, p.status,
	p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_by_principal_id, p.updated_by_principal_id, p.created_at, p.updated_at`

func scanPost(scanner interface{ Scan(...any) error }) (*domain.Post, error) {
	var post domain.Post
	err := scanner.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags),
		&post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt,
		&post.CreatedByPrincipalID, &post.UpdatedByPrincipalID, &post.CreatedAt, &post.UpdatedAt)
	return &post, err
}

func (r *PostgresRepository) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `UPDATE posts p SET
		title = v.title, slug = v.slug, summary = v.summary, content = v.content, tags = v.tags,
		category_id = v.category_id, cover_url = v.cover_url, cover_alt = v.cover_alt,
		seo_title = v.seo_title, seo_description = v.seo_description,
		status = v.status, published_at = v.published_at, scheduled_at = v.scheduled_at, updated_at = NOW()
		FROM post_versions v WHERE p.id = $1 AND v.id = $2 AND v.post_id = p.id`, postID, versionID)
	if err != nil {
		return nil, err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return nil, sql.ErrNoRows
	}

	post, err := scanPost(tx.QueryRowContext(ctx, `SELECT `+postColumns+` FROM posts p WHERE p.id = $1`, postID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return post, nil
}
