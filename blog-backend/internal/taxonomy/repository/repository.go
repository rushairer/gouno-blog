package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrCategoryNotFound = errors.New("category not found")
	ErrDuplicateSlug    = errors.New("slug or name is already in use")
)

type CategoryReader interface {
	ListCategories(context.Context) ([]domain.Category, error)
	GetCategoryBySlug(context.Context, string) (*domain.Category, error)
	ListCategoryPosts(context.Context, int64, int, int) ([]domain.Post, int, error)
}

type CategoryWriter interface {
	CreateCategory(context.Context, *domain.Category) error
	UpdateCategory(context.Context, *domain.Category) error
	DeleteCategory(context.Context, int64) error
}

type TagRepository interface {
	ListPublishedTagSummaries(context.Context) ([]domain.TagSummary, error)
	ListAdminTags(context.Context) ([]domain.TagSummary, error)
	RenameTag(context.Context, string, string) error
	DeleteTag(context.Context, string) error
	MergeTags(context.Context, string, string) error
}

type Repository interface {
	CategoryReader
	CategoryWriter
	TagRepository
}

type postgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &postgresRepository{db: db}
}

func (r *postgresRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.name, c.slug, c.description, c.sort_order, c.created_at, c.updated_at,
		       COUNT(p.id) FILTER (WHERE p.status = 'published') AS post_count
		FROM categories c
		LEFT JOIN posts p ON p.category_id = c.id
		GROUP BY c.id
		ORDER BY c.sort_order, c.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]domain.Category, 0)
	for rows.Next() {
		var item domain.Category
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt, &item.PostCount); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *postgresRepository) GetCategoryBySlug(ctx context.Context, slug string) (*domain.Category, error) {
	var item domain.Category
	err := r.db.QueryRowContext(ctx, `SELECT id, name, slug, description, sort_order, created_at, updated_at FROM categories WHERE slug = $1`, slug).
		Scan(&item.ID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *postgresRepository) ListCategoryPosts(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.Post, int, error) {
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM posts WHERE category_id = $1 AND status = 'published'`, categoryID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, title, slug, summary, content, tags, category_id,
		       COALESCE(cover_url, ''), COALESCE(cover_alt, ''), COALESCE(seo_title, ''), COALESCE(seo_description, ''),
		       status, views_count, likes_count, published_at, scheduled_at, created_at, updated_at
		FROM posts WHERE category_id = $1 AND status = 'published'
		ORDER BY published_at DESC, created_at DESC LIMIT $2 OFFSET $3`,
		categoryID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	posts := make([]domain.Post, 0)
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags), &post.CategoryID,
			&post.CoverURL, &post.CoverAlt, &post.SEOTitle, &post.SEODescription, &post.Status, &post.ViewsCount,
			&post.LikesCount, &post.PublishedAt, &post.ScheduledAt, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, 0, err
		}
		posts = append(posts, post)
	}
	return posts, total, rows.Err()
}

func (r *postgresRepository) CreateCategory(ctx context.Context, category *domain.Category) error {
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO categories (name, slug, description, sort_order) VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at`,
		category.Name, category.Slug, category.Description, category.SortOrder).
		Scan(&category.ID, &category.CreatedAt, &category.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return ErrDuplicateSlug
		}
		return err
	}
	return nil
}

func (r *postgresRepository) UpdateCategory(ctx context.Context, category *domain.Category) error {
	result, err := r.db.ExecContext(ctx, `UPDATE categories SET name=$1, slug=$2, description=$3, sort_order=$4, updated_at=NOW() WHERE id=$5`,
		category.Name, category.Slug, category.Description, category.SortOrder, category.ID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return ErrDuplicateSlug
		}
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

func (r *postgresRepository) DeleteCategory(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM categories WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

func (r *postgresRepository) ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT tag, COUNT(*)
		FROM posts, unnest(tags) tag
		WHERE status = 'published'
		GROUP BY tag
		ORDER BY COUNT(*) DESC, tag`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]domain.TagSummary, 0)
	for rows.Next() {
		var item domain.TagSummary
		if err := rows.Scan(&item.Name, &item.PostCount); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *postgresRepository) ListAdminTags(ctx context.Context) ([]domain.TagSummary, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT tag, COUNT(*) FROM posts, unnest(tags) tag GROUP BY tag ORDER BY COUNT(*) DESC, tag`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]domain.TagSummary, 0)
	for rows.Next() {
		var item domain.TagSummary
		if err := rows.Scan(&item.Name, &item.PostCount); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *postgresRepository) RenameTag(ctx context.Context, oldName, newName string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END
			FROM unnest(tags) value
		), updated_at = NOW()
		WHERE $1 = ANY(tags)`, oldName, newName)
	return err
}

func (r *postgresRepository) DeleteTag(ctx context.Context, name string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE posts SET tags = array_remove(tags, $1), updated_at=NOW() WHERE $1 = ANY(tags)`, name)
	return err
}

func (r *postgresRepository) MergeTags(ctx context.Context, source, target string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END FROM unnest(tags) value
		), updated_at=NOW() WHERE $1 = ANY(tags)`, source, target)
	return err
}
