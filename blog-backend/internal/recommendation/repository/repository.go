package repository

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

type Repository interface {
	RelatedPosts(context.Context, int64, []string, int) ([]*domain.Post, error)
}

type postgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &postgresRepository{db: db}
}

const postColumns = `p.id, p.title, p.slug, p.summary, p.content, p.tags, p.status,
	p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_by_principal_id, p.updated_by_principal_id, p.created_at, p.updated_at`

func (r *postgresRepository) RelatedPosts(ctx context.Context, postID int64, tags []string, limit int) ([]*domain.Post, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+`
		FROM posts p
		WHERE p.id <> $1 AND p.status = 'published' AND p.tags && $2
		ORDER BY (SELECT COUNT(*) FROM unnest(p.tags) tag WHERE tag = ANY($2)) DESC,
		         p.published_at DESC NULLS LAST
		LIMIT $3`, postID, pq.Array(tags), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags),
			&post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt,
			&post.CreatedByPrincipalID, &post.UpdatedByPrincipalID, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, &post)
	}
	return posts, rows.Err()
}
