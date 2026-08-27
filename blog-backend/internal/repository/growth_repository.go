package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

type GrowthRepository struct {
	db *sql.DB
}

func NewGrowthRepository(db *sql.DB) *GrowthRepository {
	return &GrowthRepository{db: db}
}

func scanGrowthPost(scanner interface{ Scan(...any) error }) (*domain.Post, error) {
	var post domain.Post
	err := scanner.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags),
		&post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt,
		&post.CreatedByPrincipalID, &post.UpdatedByPrincipalID,
		&post.CreatedAt, &post.UpdatedAt)
	return &post, err
}

const growthPostColumns = `p.id, p.title, p.slug, p.summary, p.content, p.tags, p.status,
	p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_by_principal_id, p.updated_by_principal_id, p.created_at, p.updated_at`

func (r *GrowthRepository) RelatedPosts(ctx context.Context, postID int64, tags []string, limit int) ([]*domain.Post, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+growthPostColumns+`
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
		post, err := scanGrowthPost(rows)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

func (r *GrowthRepository) ListVersions(ctx context.Context, postID int64) ([]*domain.PostVersion, error) {
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

func (r *GrowthRepository) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
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
	post, err := scanGrowthPost(tx.QueryRowContext(ctx, `SELECT `+growthPostColumns+` FROM posts p WHERE p.id = $1`, postID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return post, nil
}

func (r *GrowthRepository) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	return r.db.QueryRowContext(ctx, `INSERT INTO media_assets
		(filename, storage_name, url, content_type, size_bytes, alt_text, created_by, created_by_principal_id, updated_by_principal_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at`, asset.Filename, asset.StorageName, asset.URL, asset.ContentType,
		asset.SizeBytes, asset.AltText, asset.CreatedBy, asset.CreatedByPrincipalID, asset.UpdatedByPrincipalID).Scan(&asset.ID, &asset.CreatedAt)
}

func (r *GrowthRepository) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	var asset domain.MediaAsset
	err := r.db.QueryRowContext(ctx, `SELECT m.id, m.filename, m.storage_name, m.url, m.content_type,
		m.size_bytes, m.alt_text, m.created_by, m.created_by_principal_id, m.updated_by_principal_id, m.created_at,
		(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url)
		FROM media_assets m WHERE m.id = $1`, id).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedBy, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount)
	if err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *GrowthRepository) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	query := `SELECT m.id, m.filename, m.storage_name, m.url, m.content_type,
		m.size_bytes, m.alt_text, m.created_by, m.created_by_principal_id, m.updated_by_principal_id, m.created_at,
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
			&asset.SizeBytes, &asset.AltText, &asset.CreatedBy, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount); err != nil {
			return nil, err
		}
		assets = append(assets, &asset)
	}
	return assets, rows.Err()
}

var ErrMediaInUse = errors.New("media asset is referenced by published or draft posts")

func (r *GrowthRepository) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	var count int64
	err := r.db.QueryRowContext(ctx, `SELECT 
		(SELECT COUNT(*) FROM posts p JOIN media_assets m ON m.id=$1 WHERE p.content LIKE '%' || m.url || '%' OR p.cover_url = m.url) +
		(SELECT COUNT(*) FROM pages pg JOIN media_assets m ON m.id=$1 WHERE pg.content LIKE '%' || m.url || '%')`, id).Scan(&count)
	return count, err
}

func (r *GrowthRepository) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
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

func (r *GrowthRepository) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var asset domain.MediaAsset
	err = tx.QueryRowContext(ctx, `SELECT id, filename, storage_name, url, content_type, size_bytes, alt_text, created_by, created_by_principal_id, updated_by_principal_id, created_at
		FROM media_assets WHERE id = $1 FOR UPDATE`, id).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedBy, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt)
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

func (r *GrowthRepository) UpdateMediaAltText(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	var asset domain.MediaAsset
	err := r.db.QueryRowContext(ctx, `UPDATE media_assets
		SET alt_text = $1, updated_by_principal_id = COALESCE($3, updated_by_principal_id)
		WHERE id = $2
		RETURNING id, filename, storage_name, url, content_type, size_bytes, alt_text, created_by, created_by_principal_id, updated_by_principal_id, created_at,
		(SELECT COUNT(*) FROM posts p WHERE p.content LIKE '%' || media_assets.url || '%' OR p.cover_url = media_assets.url)`,
		altText, id, updatedByPrincipalID).
		Scan(&asset.ID, &asset.Filename, &asset.StorageName, &asset.URL, &asset.ContentType,
			&asset.SizeBytes, &asset.AltText, &asset.CreatedBy, &asset.CreatedByPrincipalID, &asset.UpdatedByPrincipalID, &asset.CreatedAt, &asset.UsageCount)
	if err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *GrowthRepository) RecordEvent(ctx context.Context, postID int64, eventType, actorKey string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO analytics_events (post_id, event_type, actor_key)
		VALUES ($1, $2, $3)`, postID, eventType, actorKey)
	return err
}

func (r *GrowthRepository) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	summary := &domain.AnalyticsSummary{}
	err := r.db.QueryRowContext(ctx, `SELECT
		COUNT(*), COUNT(*) FILTER (WHERE status = 'published'),
		COALESCE(SUM(views_count), 0), COALESCE(SUM(likes_count), 0)
		FROM posts`).Scan(&summary.TotalPosts, &summary.PublishedPosts, &summary.TotalViews, &summary.TotalLikes)
	if err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM comments),
		(SELECT COUNT(*) FROM comments WHERE status = 'pending'),
		(SELECT COUNT(DISTINCT comment_id) FROM comment_reports)`).
		Scan(&summary.TotalComments, &summary.PendingComments, &summary.ReportedItems); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+growthPostColumns+` FROM posts p
		WHERE p.status = 'published' ORDER BY p.views_count DESC, p.likes_count DESC LIMIT 5`)
	if err != nil {
		return nil, err
	}
	summary.TopPosts = make([]*domain.Post, 0)
	for rows.Next() {
		post, scanErr := scanGrowthPost(rows)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		summary.TopPosts = append(summary.TopPosts, post)
	}
	rows.Close()
	eventRows, err := r.db.QueryContext(ctx, `SELECT to_char(day, 'YYYY-MM-DD'), COUNT(e.id)
		FROM generate_series(CURRENT_DATE - INTERVAL '13 day', CURRENT_DATE, INTERVAL '1 day') day
		LEFT JOIN analytics_events e ON e.created_at >= day AND e.created_at < day + INTERVAL '1 day'
		GROUP BY day ORDER BY day`)
	if err != nil {
		return nil, err
	}
	defer eventRows.Close()
	summary.DailyEvents = make([]domain.DailyEventCount, 0)
	for eventRows.Next() {
		var item domain.DailyEventCount
		if err := eventRows.Scan(&item.Date, &item.Count); err != nil {
			return nil, err
		}
		summary.DailyEvents = append(summary.DailyEvents, item)
	}
	if err := eventRows.Err(); err != nil {
		return nil, err
	}
	alertRows, err := r.db.QueryContext(ctx, `SELECT id, type, COALESCE(title,''), COALESCE(body,''), COALESCE(href,''), created_at
		FROM notifications WHERE type LIKE 'ai_%' AND read_at IS NULL ORDER BY created_at DESC LIMIT 5`)
	if err != nil {
		return nil, err
	}
	defer alertRows.Close()
	summary.AIAlerts = make([]domain.SystemAlert, 0)
	for alertRows.Next() {
		var alert domain.SystemAlert
		if err := alertRows.Scan(&alert.ID, &alert.Type, &alert.Title, &alert.Body, &alert.Href, &alert.CreatedAt); err != nil {
			return nil, err
		}
		summary.AIAlerts = append(summary.AIAlerts, alert)
	}
	return summary, alertRows.Err()
}
