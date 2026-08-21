package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

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
		INSERT INTO posts (title, slug, summary, content, tags, category_id, cover_url, cover_alt, seo_title, seo_description, status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags), post.CategoryID, post.CoverURL, post.CoverAlt, post.SEOTitle, post.SEODescription, post.Status, post.ViewsCount, post.LikesCount, post.PublishedAt, post.ScheduledAt,
	).Scan(&post.ID, &post.CreatedAt, &post.UpdatedAt)
	return err
}

func (r *PostRepository) Update(ctx context.Context, post *domain.Post) error {
	query := `
		UPDATE posts
		SET title = $1, slug = $2, summary = $3, content = $4, tags = $5, category_id = $6,
		    cover_url = $7, cover_alt = $8, seo_title = $9, seo_description = $10,
		    status = $11, published_at = $12, scheduled_at = $13, updated_at = NOW()
		WHERE id = $14
		RETURNING updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		post.Title, post.Slug, post.Summary, post.Content, pq.Array(post.Tags), post.CategoryID, post.CoverURL, post.CoverAlt, post.SEOTitle, post.SEODescription, post.Status, post.PublishedAt, post.ScheduledAt, post.ID,
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
		SELECT id, title, slug, summary, content, tags, category_id, COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''), status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE id = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID, &post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
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
		SELECT id, title, slug, summary, content, tags, category_id, COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''), status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE slug = $1
	`
	var post domain.Post
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID, &post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
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
		SELECT id, title, slug, summary, content, tags, category_id, COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''), status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
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
			&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID, &post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt,
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

func (r *PostRepository) ListAdmin(ctx context.Context, filter domain.AdminPostFilter, limit, offset int) ([]*domain.Post, int, error) {
	args := make([]interface{}, 0, 6)
	where := make([]string, 0, 4)
	if filter.Query != "" {
		args = append(args, "%"+filter.Query+"%")
		where = append(where, fmt.Sprintf("(p.title ILIKE $%d OR p.slug ILIKE $%d OR p.summary ILIKE $%d OR p.content ILIKE $%d)", len(args), len(args), len(args), len(args)))
	}
	if filter.Status != "" {
		args = append(args, filter.Status)
		where = append(where, fmt.Sprintf("p.status = $%d", len(args)))
	}
	if filter.Category != "" {
		args = append(args, filter.Category)
		where = append(where, fmt.Sprintf("c.slug = $%d", len(args)))
	}
	if filter.Tag != "" {
		args = append(args, filter.Tag)
		where = append(where, fmt.Sprintf("$%d = ANY(p.tags)", len(args)))
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}
	var total int
	countQuery := `SELECT COUNT(*) FROM posts p LEFT JOIN categories c ON c.id = p.category_id` + whereSQL
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	listQuery := fmt.Sprintf(`SELECT p.id, p.title, p.slug, p.summary, p.content, p.tags, p.category_id, COALESCE(p.cover_url, ''), COALESCE(p.cover_alt, ''), COALESCE(p.seo_title, ''), COALESCE(p.seo_description, ''), p.status, p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_at, p.updated_at
		FROM posts p LEFT JOIN categories c ON c.id = p.category_id%s ORDER BY p.updated_at DESC LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args))
	rows, err := r.db.QueryContext(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID, &post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, 0, err
		}
		posts = append(posts, &post)
	}
	return posts, total, rows.Err()
}

func (r *PostRepository) SearchPublished(ctx context.Context, query string, limit int) ([]domain.PostSearchResult, error) {
	rows, err := r.db.QueryContext(ctx, `
		WITH search AS (SELECT websearch_to_tsquery('simple', $1) AS query)
		SELECT p.id, p.title, p.slug, p.summary, p.content, p.tags, p.category_id,
		       COALESCE(p.cover_url, ''), COALESCE(p.cover_alt, ''), COALESCE(p.seo_title, ''), COALESCE(p.seo_description, ''),
		       p.status, p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_at, p.updated_at,
		       ts_headline('simple', p.content, search.query, 'MaxWords=28, MinWords=12, MaxFragments=2'),
		       ts_rank_cd(p.search_document, search.query)
		FROM posts p CROSS JOIN search
		WHERE p.status = 'published' AND p.search_document @@ search.query
		ORDER BY ts_rank_cd(p.search_document, search.query) DESC, p.published_at DESC NULLS LAST
		LIMIT $2`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results := make([]domain.PostSearchResult, 0)
	for rows.Next() {
		var post domain.Post
		var result domain.PostSearchResult
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount,
			&post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt, &result.Snippet, &result.Score); err != nil {
			return nil, err
		}
		result.Post = &post
		results = append(results, result)
	}
	return results, rows.Err()
}

func (r *PostRepository) ListStalePublished(ctx context.Context, updatedBefore time.Time, limit int) ([]*domain.Post, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, title, slug, summary, content, tags, category_id,
		COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''),
		status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts WHERE status = 'published' AND updated_at < $1
		ORDER BY updated_at ASC LIMIT $2`, updatedBefore, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount,
			&post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, &post)
	}
	return posts, rows.Err()
}

func (r *PostRepository) ListOrphanedPublished(ctx context.Context, limit int) ([]*domain.Post, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT target.id, target.title, target.slug, target.summary, target.content, target.tags, target.category_id,
		COALESCE(target.cover_url, ''), COALESCE(target.cover_alt, ''), COALESCE(target.seo_title, ''), COALESCE(target.seo_description, ''),
		target.status, target.views_count, target.likes_count, target.published_at, target.scheduled_at, target.created_at, target.updated_at
		FROM posts target
		WHERE target.status = 'published' AND NOT EXISTS (
			SELECT 1 FROM posts source
			WHERE source.status = 'published' AND source.id <> target.id
			  AND (position('/articles/' || target.slug IN source.content) > 0 OR position('/posts/' || target.slug IN source.content) > 0)
		)
		ORDER BY target.published_at ASC NULLS LAST, target.created_at ASC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount,
			&post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, &post)
	}
	return posts, rows.Err()
}

func (r *PostRepository) ListLowEngagementPublished(ctx context.Context, minViews int64, maxEngagementRate float64, limit int) ([]*domain.Post, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, title, slug, summary, content, tags, category_id,
		COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''),
		status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts
		WHERE status = 'published' AND views_count >= $1
		  AND COALESCE(likes_count::DOUBLE PRECISION / NULLIF(views_count, 0), 0) <= $2
		ORDER BY views_count DESC, updated_at ASC LIMIT $3`, minViews, maxEngagementRate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := make([]*domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount, &post.LikesCount,
			&post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, &post)
	}
	return posts, rows.Err()
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

func (r *PostRepository) Batch(ctx context.Context, ids []int64, action string) (int64, error) {
	var (
		result sql.Result
		err    error
	)
	switch action {
	case "publish":
		var invalidCount int
		err = r.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM posts
			WHERE id=ANY($1) AND (btrim(title) = '' OR btrim(content) = '')`,
			pq.Array(ids)).Scan(&invalidCount)
		if err != nil {
			return 0, err
		}
		if invalidCount > 0 {
			return 0, fmt.Errorf("posts must have a title and content before publishing")
		}
		result, err = r.db.ExecContext(ctx, `UPDATE posts SET status='published', published_at=COALESCE(published_at, NOW()), scheduled_at=NULL, updated_at=NOW() WHERE id=ANY($1)`, pq.Array(ids))
	case "draft":
		result, err = r.db.ExecContext(ctx, `UPDATE posts SET status='draft', published_at=NULL, scheduled_at=NULL, updated_at=NOW() WHERE id=ANY($1)`, pq.Array(ids))
	case "delete":
		result, err = r.db.ExecContext(ctx, `DELETE FROM posts WHERE id=ANY($1)`, pq.Array(ids))
	default:
		return 0, fmt.Errorf("action must be publish, draft, or delete")
	}
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

