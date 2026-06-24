package repository

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

func (r *PostRepository) Create(ctx context.Context, post *domain.Post) error {
	query := `
		INSERT INTO posts (title, slug, summary, content, tags, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags),
	).Scan(&post.ID, &post.CreatedAt, &post.UpdatedAt)
	return err
}

func (r *PostRepository) Update(ctx context.Context, post *domain.Post) error {
	query := `
		UPDATE posts
		SET title = $1, slug = $2, summary = $3, content = $4, tags = $5, updated_at = NOW()
		WHERE id = $6
		RETURNING updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags), post.ID,
	).Scan(&post.UpdatedAt)
	return err
}

func (r *PostRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM posts WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *PostRepository) GetByID(ctx context.Context, id int64) (*domain.Post, error) {
	query := `
		SELECT id, title, slug, summary, content, tags, created_at, updated_at
		FROM posts
		WHERE id = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CreatedAt, &post.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *PostRepository) GetBySlug(ctx context.Context, slug string) (*domain.Post, error) {
	query := `
		SELECT id, title, slug, summary, content, tags, created_at, updated_at
		FROM posts
		WHERE slug = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CreatedAt, &post.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *PostRepository) List(ctx context.Context, tag string, limit, offset int) ([]*domain.Post, int, error) {
	var countQuery string
	var listQuery string
	var args []interface{}

	if tag != "" {
		countQuery = `SELECT COUNT(*) FROM posts WHERE $1 = ANY(tags)`
		listQuery = `
			SELECT id, title, slug, summary, content, tags, created_at, updated_at
			FROM posts
			WHERE $1 = ANY(tags)
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = append(args, tag)
	} else {
		countQuery = `SELECT COUNT(*) FROM posts`
		listQuery = `
			SELECT id, title, slug, summary, content, tags, created_at, updated_at
			FROM posts
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2
		`
	}

	var total int
	var err error
	if tag != "" {
		err = r.db.QueryRowContext(ctx, countQuery, tag).Scan(&total)
	} else {
		err = r.db.QueryRowContext(ctx, countQuery).Scan(&total)
	}
	if err != nil {
		return nil, 0, err
	}

	var rows *sql.Rows
	if tag != "" {
		rows, err = r.db.QueryContext(ctx, listQuery, tag, limit, offset)
	} else {
		rows, err = r.db.QueryContext(ctx, listQuery, limit, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var posts []*domain.Post
	for rows.Next() {
		var post domain.Post
		err := rows.Scan(
			&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CreatedAt, &post.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		posts = append(posts, &post)
	}
	return posts, total, nil
}

func (r *PostRepository) ListTags(ctx context.Context) ([]string, error) {
	query := `
		SELECT DISTINCT unnest(tags) as tag
		FROM posts
		ORDER BY tag ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, nil
}

// Comments Repository Methods
func (r *PostRepository) CreateComment(ctx context.Context, comment *domain.Comment) error {
	query := `
		INSERT INTO comments (post_id, author, content, created_at)
		VALUES ($1, $2, $3, NOW())
		RETURNING id, created_at
	`
	err := r.db.QueryRowContext(ctx, query,
		comment.PostID, comment.Author, comment.Content,
	).Scan(&comment.ID, &comment.CreatedAt)
	return err
}

func (r *PostRepository) GetCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	query := `
		SELECT id, post_id, author, content, created_at
		FROM comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		var comment domain.Comment
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.Author, &comment.Content, &comment.CreatedAt)
		if err != nil {
			return nil, err
		}
		comments = append(comments, &comment)
	}
	return comments, nil
}

func (r *PostRepository) DeleteComment(ctx context.Context, id int64) error {
	query := `DELETE FROM comments WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
