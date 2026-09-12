package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
)

var ErrMediaInUse = errors.New("media asset is referenced by published or draft posts")

// Repository owns persistent media-asset metadata and reference inspection.
// Binary object storage remains the responsibility of the parent internal/media package.
type Repository interface {
	CreateMedia(context.Context, *domain.MediaAsset) error
	GetMedia(context.Context, int64) (*domain.MediaAsset, error)
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	UpdateMediaAltText(context.Context, int64, string, *int64) (*domain.MediaAsset, error)
	DeleteMedia(context.Context, int64) (*domain.MediaAsset, error)
	CountMediaReferences(context.Context, int64) (int64, error)
	ListMediaReferences(context.Context, int64) ([]*domain.MediaReference, error)
}

type postgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &postgresRepository{db: db}
}

func (r *postgresRepository) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO media_assets
		(filename, storage_name, url, content_type, size_bytes, alt_text, created_by_principal_id, updated_by_principal_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at`, asset.Filename, asset.StorageName, asset.URL, asset.ContentType,
		asset.SizeBytes, asset.AltText, asset.CreatedByPrincipalID, asset.UpdatedByPrincipalID).Scan(&asset.ID, &asset.CreatedAt)
}

func (r *postgresRepository) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	var asset domain.MediaAsset
	err := r.db.QueryRowContext(ctx, `SELECT m.id, m.filename, m.storage_name, m.url, m.content_type,
		m.size_bytes, m.alt_text, m.created_by_principal_id, m.updated_by_principal_id, m.created_at,
		(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url)
		FROM media_assets m WHERE m.id = $1`, id).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount)
	if err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *postgresRepository) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	query := `SELECT m.id, m.filename, m.storage_name, m.url, m.content_type,
		m.size_bytes, m.alt_text, m.created_by_principal_id, m.updated_by_principal_id, m.created_at,
		(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url)
		FROM media_assets m`
	args := []interface{}{}
	if filter.CreatedByPrincipalID != nil {
		query += ` WHERE m.created_by_principal_id = $1`
		args = append(args, *filter.CreatedByPrincipalID)
	}
	query += ` ORDER BY m.created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assets := make([]*domain.MediaAsset, 0)
	for rows.Next() {
		var asset domain.MediaAsset
		if err := rows.Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount); err != nil {
			return nil, err
		}
		assets = append(assets, &asset)
	}
	return assets, rows.Err()
}

func (r *postgresRepository) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	var count int64
	err := r.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM posts p JOIN media_assets m ON m.id=$1 WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url) +
		(SELECT COUNT(*) FROM pages pg JOIN media_assets m ON m.id=$1 WHERE pg.content LIKE '%' || m.url || '%')`, id).Scan(&count)
	return count, err
}

func (r *postgresRepository) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT p.id, p.title, p.slug FROM posts p
		JOIN media_assets m ON m.id=$1
		WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url
		ORDER BY p.updated_at DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.MediaReference, 0)
	for rows.Next() {
		var item domain.MediaReference
		if err := rows.Scan(&item.PostID, &item.PostTitle, &item.PostSlug); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (r *postgresRepository) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var asset domain.MediaAsset
	err = tx.QueryRowContext(ctx, `SELECT id, filename, storage_name, url, content_type, size_bytes, alt_text, created_by_principal_id, updated_by_principal_id, created_at
		FROM media_assets WHERE id = $1 FOR UPDATE`, id).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt)
	if err != nil {
		return nil, err
	}

	var postRefs, pageRefs int64
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM posts WHERE content LIKE '%' || $1 || '%' OR cover_url = $1`, asset.URL).Scan(&postRefs); err != nil {
		return nil, err
	}
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM pages WHERE content LIKE '%' || $1 || '%'`, asset.URL).Scan(&pageRefs); err != nil {
		return nil, err
	}

	if postRefs > 0 || pageRefs > 0 {
		return nil, ErrMediaInUse
	}

	if _, err = tx.ExecContext(ctx, `DELETE FROM media_assets WHERE id = $1`, id); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *postgresRepository) UpdateMediaAltText(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	var asset domain.MediaAsset
	err := r.db.QueryRowContext(ctx, `UPDATE media_assets
		SET alt_text = $1, updated_by_principal_id = COALESCE($3, updated_by_principal_id)
		WHERE id = $2
		RETURNING id, filename, storage_name, url, content_type, size_bytes, alt_text, created_by_principal_id, updated_by_principal_id, created_at,
		(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%' || media_assets.url || '%' OR p.cover_url = media_assets.url)`,
		altText, id, updatedByPrincipalID).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount)
	if err != nil {
		return nil, err
	}
	return &asset, nil
}
