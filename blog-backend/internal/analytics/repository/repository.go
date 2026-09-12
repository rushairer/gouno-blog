package repository

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
)

// Repository owns the persisted analytics event stream and the cross-capability
// analytics read model used by the dashboard and Agent tools.
type Repository interface {
	RecordEvent(context.Context, int64, string, string) error
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

type postgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &postgresRepository{db: db}
}

const analyticsPostColumns = `p.id, p.title, p.slug, p.summary, p.content, p.tags, p.status,
	p.views_count, p.likes_count, p.published_at, p.scheduled_at, p.created_by_principal_id, p.updated_by_principal_id, p.created_at, p.updated_at`

func scanAnalyticsPost(scanner interface{ Scan(...any) error }) (*domain.Post, error) {
	var post domain.Post
	err := scanner.Scan(&post.ID, &post.Title, &post.Slug, &post.Summary, &post.Content, pq.Array(&post.Tags),
		&post.Status, &post.ViewsCount, &post.LikesCount, &post.PublishedAt, &post.ScheduledAt,
		&post.CreatedByPrincipalID, &post.UpdatedByPrincipalID,
		&post.CreatedAt, &post.UpdatedAt)
	return &post, err
}

func (r *postgresRepository) RecordEvent(ctx context.Context, postID int64, eventType, actorKey string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO analytics_events (post_id, event_type, actor_key)
		VALUES ($1, $2, $3)`, postID, eventType, actorKey)
	return err
}

func (r *postgresRepository) AnalyticsSummary(ctx context.Context) (*domain.AnalyticsSummary, error) {
	summary := &domain.AnalyticsSummary{}
	if err := r.db.QueryRowContext(ctx, `SELECT
		COUNT(*), COUNT(*) FILTER (WHERE status = 'published'),
		COALESCE(SUM(views_count), 0), COALESCE(SUM(likes_count), 0)
		FROM posts`).Scan(&summary.TotalPosts, &summary.PublishedPosts, &summary.TotalViews, &summary.TotalLikes); err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM comments),
		(SELECT COUNT(*) FROM comments WHERE status = 'pending'),
		(SELECT COUNT(DISTINCT comment_id) FROM comment_reports)`).
		Scan(&summary.TotalComments, &summary.PendingComments, &summary.ReportedItems); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+analyticsPostColumns+` FROM posts p
		WHERE p.status = 'published' ORDER BY p.views_count DESC, p.likes_count DESC LIMIT 5`)
	if err != nil {
		return nil, err
	}
	summary.TopPosts = make([]*domain.Post, 0)
	for rows.Next() {
		post, scanErr := scanAnalyticsPost(rows)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		summary.TopPosts = append(summary.TopPosts, post)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

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
