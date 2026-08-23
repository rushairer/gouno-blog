package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrCategoryNotFound = errors.New("category not found")
	ErrPostNotFound     = errors.New("post not found")
	ErrDuplicateSlug    = errors.New("slug or name is already in use")
)

// CategoryReader provides read operations for categories.
type CategoryReader interface {
	ListCategories(ctx context.Context) ([]domain.Category, error)
	GetCategoryBySlug(ctx context.Context, slug string) (*domain.Category, error)
	ListCategoryPosts(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.Post, int, error)
}

// CategoryWriter provides write operations for categories.
type CategoryWriter interface {
	CreateCategory(ctx context.Context, category *domain.Category) error
	UpdateCategory(ctx context.Context, category *domain.Category) error
	DeleteCategory(ctx context.Context, id int64) error
}

// TagRepository handles tag management operations.
type TagRepository interface {
	ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error)
	ListAdminTags(ctx context.Context) ([]domain.TagSummary, error)
	RenameTag(ctx context.Context, oldName, newName string) error
	DeleteTag(ctx context.Context, name string) error
	MergeTags(ctx context.Context, source, target string) error
}

// SettingRepository handles key-value site settings persistence.
type SettingRepository interface {
	GetSiteSettings(ctx context.Context) (map[string]string, error)
	UpdateSiteSettings(ctx context.Context, settings map[string]string) (map[string]string, error)
}

// CategoryRepository composites category, tag, and setting persistence operations.
type CategoryRepository interface {
	CategoryReader
	CategoryWriter
	TagRepository
	SettingRepository
}

type categoryRepository struct {
	db *sql.DB
}

func NewCategoryRepository(db *sql.DB) CategoryRepository {
	return &categoryRepository{db: db}
}

func NewTagRepository(db *sql.DB) TagRepository {
	return &categoryRepository{db: db}
}

func NewSettingRepository(db *sql.DB) SettingRepository {
	return &categoryRepository{db: db}
}

func (r *categoryRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
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
	return result, nil
}

func (r *categoryRepository) GetCategoryBySlug(ctx context.Context, slug string) (*domain.Category, error) {
	var item domain.Category
	err := r.db.QueryRowContext(ctx, `SELECT id, name, slug, description, sort_order, created_at, updated_at FROM categories WHERE slug = $1`, slug).
		Scan(&item.ID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrCategoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *categoryRepository) ListCategoryPosts(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.Post, int, error) {
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
	return posts, total, nil
}

func (r *categoryRepository) CreateCategory(ctx context.Context, category *domain.Category) error {
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

func (r *categoryRepository) UpdateCategory(ctx context.Context, category *domain.Category) error {
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

func (r *categoryRepository) DeleteCategory(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM categories WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count == 0 {
		return ErrCategoryNotFound
	}
	return nil
}

func (r *categoryRepository) ListPublishedTagSummaries(ctx context.Context) ([]domain.TagSummary, error) {
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

func (r *categoryRepository) ListAdminTags(ctx context.Context) ([]domain.TagSummary, error) {
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
	return result, nil
}

func (r *categoryRepository) RenameTag(ctx context.Context, oldName, newName string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END
			FROM unnest(tags) value
		), updated_at = NOW()
		WHERE $1 = ANY(tags)`, oldName, newName)
	return err
}

func (r *categoryRepository) DeleteTag(ctx context.Context, name string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE posts SET tags = array_remove(tags, $1), updated_at=NOW() WHERE $1 = ANY(tags)`, name)
	return err
}

func (r *categoryRepository) MergeTags(ctx context.Context, source, target string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE posts SET tags = ARRAY(
			SELECT DISTINCT CASE WHEN value = $1 THEN $2 ELSE value END FROM unnest(tags) value
		), updated_at=NOW() WHERE $1 = ANY(tags)`, source, target)
	return err
}

func (r *categoryRepository) GetSiteSettings(ctx context.Context) (map[string]string, error) {
	var raw []byte
	if err := r.db.QueryRowContext(ctx, `SELECT settings FROM site_settings WHERE id=1`).Scan(&raw); err != nil {
		return nil, err
	}
	var settings map[string]string
	if err := json.Unmarshal(raw, &settings); err != nil {
		return nil, err
	}
	return settings, nil
}

func (r *categoryRepository) UpdateSiteSettings(ctx context.Context, settings map[string]string) (map[string]string, error) {
	raw, err := json.Marshal(settings)
	if err != nil {
		return nil, err
	}
	var saved []byte
	err = r.db.QueryRowContext(ctx, `UPDATE site_settings SET settings = settings || $1::jsonb, updated_at=NOW() WHERE id=1 RETURNING settings`, string(raw)).Scan(&saved)
	if err != nil {
		return nil, err
	}
	var res map[string]string
	_ = json.Unmarshal(saved, &res)
	return res, nil
}
