package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

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
		INSERT INTO posts (title, slug, summary, content, tags, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags), post.Status, post.ViewsCount, post.LikesCount, post.PublishedAt, post.ScheduledAt,
	).Scan(&post.ID, &post.CreatedAt, &post.UpdatedAt)
	return err
}

func (r *PostRepository) Update(ctx context.Context, post *domain.Post) error {
	query := `
		UPDATE posts
		SET title = $1, slug = $2, summary = $3, content = $4, tags = $5, status = $6, published_at = $7, scheduled_at = $8, updated_at = NOW()
		WHERE id = $9
		RETURNING updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags), post.Status, post.PublishedAt, post.ScheduledAt, post.ID,
	).Scan(&post.UpdatedAt)
	return err
}

func (r *PostRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM posts WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return sql.ErrNoRows
	}
	return err
}

func (r *PostRepository) GetByID(ctx context.Context, id int64) (*domain.Post, error) {
	query := `
		SELECT id, title, slug, summary, content, tags, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE id = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
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
		SELECT id, title, slug, summary, content, tags, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE slug = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (r *PostRepository) IncrementViews(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE posts SET views_count = views_count + 1 WHERE id = $1`, id)
	return err
}

func (r *PostRepository) IncrementLikes(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1`, id)
	return err
}

func (r *PostRepository) List(ctx context.Context, tag, search string, limit, offset int) ([]*domain.Post, int, error) {
	var countQuery string
	var listQuery string
	args := []interface{}{}
	whereClauses := []string{"status = 'published'"}
	argIdx := 1

	if tag != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("$%d = ANY(tags)", argIdx))
		args = append(args, tag)
		argIdx++
	}

	if search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(title ILIKE $%d OR summary ILIKE $%d OR content ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	whereStmt := strings.Join(whereClauses, " AND ")
	countQuery = fmt.Sprintf(`SELECT COUNT(*) FROM posts WHERE %s`, whereStmt)

	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	listArgs := append([]interface{}{}, args...)
	listArgs = append(listArgs, limit, offset)
	listQuery = fmt.Sprintf(`
		SELECT id, title, slug, summary, content, tags, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE %s
		ORDER BY published_at DESC, created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereStmt, argIdx, argIdx+1)

	rows, err := r.db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		err := rows.Scan(
			&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		posts = append(posts, &post)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return posts, total, nil
}

func (r *PostRepository) ListTags(ctx context.Context) ([]string, error) {
	query := `
		SELECT DISTINCT unnest(tags) as tag
		FROM posts WHERE status = 'published'
		ORDER BY tag ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tags := make([]string, 0)
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tags, nil
}

func (r *PostRepository) ListAdmin(ctx context.Context, limit, offset int) ([]*domain.Post, int, error) {
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM posts`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id, title, slug, summary, content, tags, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at FROM posts ORDER BY updated_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, 0, err
		}
		posts = append(posts, &post)
	}
	return posts, total, rows.Err()
}

func (r *PostRepository) PublishScheduled(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE posts SET status = 'published', published_at = NOW(), scheduled_at = NULL, updated_at = NOW() WHERE status = 'scheduled' AND scheduled_at <= NOW()`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// Comments Repository Methods
func (r *PostRepository) CreateComment(ctx context.Context, comment *domain.Comment) error {
	query := `
		INSERT INTO comments (post_id, parent_id, author, content, is_visible, created_at)
		VALUES ($1, $2, $3, $4, false, NOW())
		RETURNING id, is_visible, created_at
	`
	err := r.db.QueryRowContext(ctx, query,
		comment.PostID, comment.ParentID, comment.Author, comment.Content,
	).Scan(&comment.ID, &comment.IsVisible, &comment.CreatedAt)
	return err
}

func (r *PostRepository) GetVisibleCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	return r.getCommentsByPostID(ctx, postID, true)
}

func (r *PostRepository) GetAllCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	return r.getCommentsByPostID(ctx, postID, false)
}

func (r *PostRepository) getCommentsByPostID(ctx context.Context, postID int64, visibleOnly bool) ([]*domain.Comment, error) {
	query := `
		SELECT id, post_id, parent_id, author, content, is_visible, created_at
		FROM comments
		WHERE post_id = $1
		ORDER BY created_at ASC
	`
	if visibleOnly {
		query = `
			SELECT id, post_id, parent_id, author, content, is_visible, created_at
			FROM comments
			WHERE post_id = $1 AND is_visible = true
			ORDER BY created_at ASC
		`
	}
	rows, err := r.db.QueryContext(ctx, query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := make([]*domain.Comment, 0)
	for rows.Next() {
		var comment domain.Comment
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.ParentID, &comment.Author, &comment.Content, &comment.IsVisible, &comment.CreatedAt)
		if err != nil {
			return nil, err
		}
		comments = append(comments, &comment)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return comments, nil
}

func (r *PostRepository) SetCommentVisibility(ctx context.Context, id int64, isVisible bool) error {
	query := `UPDATE comments SET is_visible = $1 WHERE id = $2`
	result, err := r.db.ExecContext(ctx, query, isVisible, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return sql.ErrNoRows
	}
	return err
}

func (r *PostRepository) DeleteComment(ctx context.Context, id int64) error {
	query := `DELETE FROM comments WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err == nil && rows == 0 {
		return sql.ErrNoRows
	}
	return err
}
