package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

type PageRepository struct {
	db *sql.DB
}

func NewPageRepository(db *sql.DB) *PageRepository {
	return &PageRepository{db: db}
}

func (r *PageRepository) Create(ctx context.Context, p *domain.Page) error {
	query := `
		INSERT INTO pages (
			title, slug, content, summary, template, status,
			allow_comments, show_in_nav, sort_order, seo_title, seo_description,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	template := p.Template
	if template == "" {
		template = string(domain.PageTemplateDefault)
	}
	status := p.Status
	if status == "" {
		status = domain.PageStatusDraft
	}
	return r.db.QueryRowContext(ctx, query,
		p.Title, p.Slug, p.Content, p.Summary, template, status,
		p.AllowComments, p.ShowInNav, p.SortOrder, p.SEOTitle, p.SEODescription,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

func (r *PageRepository) Update(ctx context.Context, p *domain.Page) error {
	query := `
		UPDATE pages
		SET title = $1, slug = $2, content = $3, summary = $4, template = $5,
		    status = $6, allow_comments = $7, show_in_nav = $8, sort_order = $9,
		    seo_title = $10, seo_description = $11, updated_at = NOW()
		WHERE id = $12
		RETURNING updated_at
	`
	template := p.Template
	if template == "" {
		template = string(domain.PageTemplateDefault)
	}
	return r.db.QueryRowContext(ctx, query,
		p.Title, p.Slug, p.Content, p.Summary, template,
		p.Status, p.AllowComments, p.ShowInNav, p.SortOrder,
		p.SEOTitle, p.SEODescription, p.ID,
	).Scan(&p.UpdatedAt)
}

func (r *PageRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM pages WHERE id = $1`
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

func (r *PageRepository) GetByID(ctx context.Context, id int64) (*domain.Page, error) {
	query := `
		SELECT id, title, slug, content, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		WHERE id = $1
	`
	var p domain.Page
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&p.ID, &p.Title, &p.Slug, &p.Content, &p.Summary, &p.Template, &p.Status,
		&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PageRepository) GetBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	query := `
		SELECT id, title, slug, content, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		WHERE slug = $1
	`
	var p domain.Page
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&p.ID, &p.Title, &p.Slug, &p.Content, &p.Summary, &p.Template, &p.Status,
		&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PageRepository) GetPublishedBySlug(ctx context.Context, slug string) (*domain.Page, error) {
	query := `
		SELECT id, title, slug, content, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		WHERE slug = $1 AND status = 'published'
	`
	var p domain.Page
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&p.ID, &p.Title, &p.Slug, &p.Content, &p.Summary, &p.Template, &p.Status,
		&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PageRepository) ListPublishedNav(ctx context.Context) ([]*domain.Page, error) {
	query := `
		SELECT id, title, slug, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		WHERE status = 'published' AND show_in_nav = true
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*domain.Page
	for rows.Next() {
		var p domain.Page
		if err := rows.Scan(
			&p.ID, &p.Title, &p.Slug, &p.Summary, &p.Template, &p.Status,
			&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		pages = append(pages, &p)
	}
	return pages, rows.Err()
}

func (r *PageRepository) ListPublished(ctx context.Context) ([]*domain.Page, error) {
	query := `
		SELECT id, title, slug, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		WHERE status = 'published'
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*domain.Page
	for rows.Next() {
		var p domain.Page
		if err := rows.Scan(
			&p.ID, &p.Title, &p.Slug, &p.Summary, &p.Template, &p.Status,
			&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		pages = append(pages, &p)
	}
	return pages, rows.Err()
}

func (r *PageRepository) ListAdmin(ctx context.Context, filter domain.AdminPageFilter, page, pageSize int) ([]*domain.Page, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var conditions []string
	var args []interface{}
	idx := 1

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", idx))
		args = append(args, filter.Status)
		idx++
	}
	if query := strings.TrimSpace(filter.Query); query != "" {
		conditions = append(conditions, fmt.Sprintf("(title ILIKE $%d OR slug ILIKE $%d OR summary ILIKE $%d)", idx, idx, idx))
		args = append(args, "%"+query+"%")
		idx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM pages %s", where)
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	dataQuery := fmt.Sprintf(`
		SELECT id, title, slug, summary, template, status,
		       allow_comments, show_in_nav, sort_order, seo_title, seo_description,
		       created_at, updated_at
		FROM pages
		%s
		ORDER BY sort_order ASC, updated_at DESC, id DESC
		LIMIT $%d OFFSET $%d
	`, where, idx, idx+1)
	args = append(args, pageSize, offset)

	rows, err := r.db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var pages []*domain.Page
	for rows.Next() {
		var p domain.Page
		if err := rows.Scan(
			&p.ID, &p.Title, &p.Slug, &p.Summary, &p.Template, &p.Status,
			&p.AllowComments, &p.ShowInNav, &p.SortOrder, &p.SEOTitle, &p.SEODescription,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		pages = append(pages, &p)
	}
	return pages, total, rows.Err()
}
