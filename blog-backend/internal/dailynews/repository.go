package dailynews

import (
	"context"
	"database/sql"
	"github.com/rushairer/blog-backend/internal/domain"
	"time"
)

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }
func scanJob(s interface{ Scan(...any) error }) (*domain.DailyNewsJob, error) {
	var v domain.DailyNewsJob
	err := s.Scan(&v.Enabled, &v.CronExpression, &v.Timezone, &v.LastSuccessfulDate, &v.CreatedBy, &v.UpdatedAt)
	return &v, err
}
func scanRun(s interface{ Scan(...any) error }) (*domain.DailyNewsRun, error) {
	var v domain.DailyNewsRun
	err := s.Scan(&v.ID, &v.RunDate, &v.Status, &v.Trigger, &v.SourceCount, &v.PostID, &v.Provider, &v.Model, &v.RetryCount, &v.ErrorMessage, &v.StartedAt, &v.FinishedAt, &v.CreatedAt)
	return &v, err
}

const runColumns = "id, run_date, status, trigger, source_count, post_id, COALESCE(provider,''), COALESCE(model,''), retry_count, COALESCE(error_message,''), started_at, finished_at, created_at"

func (r *Repository) Job(ctx context.Context) (*domain.DailyNewsJob, error) {
	return scanJob(r.db.QueryRowContext(ctx, "SELECT enabled,cron_expression,timezone,last_successful_date,created_by,updated_at FROM ai_daily_news_jobs WHERE id=1"))
}
func (r *Repository) SaveJob(ctx context.Context, enabled bool, by *string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE ai_daily_news_jobs SET enabled=$1, created_by=COALESCE($2,created_by), updated_at=NOW() WHERE id=1", enabled, by)
	return err
}
func (r *Repository) Latest(ctx context.Context) (*domain.DailyNewsRun, error) {
	return scanRun(r.db.QueryRowContext(ctx, "SELECT "+runColumns+" FROM ai_daily_news_runs ORDER BY created_at DESC LIMIT 1"))
}
func (r *Repository) RunForDate(ctx context.Context, date time.Time) (*domain.DailyNewsRun, error) {
	return scanRun(r.db.QueryRowContext(ctx, "SELECT "+runColumns+" FROM ai_daily_news_runs WHERE run_date=$1", date))
}

// RecoverInterrupted marks work abandoned by a process restart as retryable.
func (r *Repository) RecoverInterrupted(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, "UPDATE ai_daily_news_runs SET status='failed', error_message='daily-news worker was interrupted by restart; retry this run', finished_at=NOW() WHERE status='running'")
	return err
}
func (r *Repository) Sources(ctx context.Context, runID int64) ([]domain.DailyNewsSource, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id,run_id,source_name,feed_url,original_url,COALESCE(guid,''),title,published_at,fetched_at,summary,dedupe_key FROM ai_daily_news_sources WHERE run_id=$1 ORDER BY id", runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.DailyNewsSource{}
	for rows.Next() {
		var v domain.DailyNewsSource
		if err := rows.Scan(&v.ID, &v.RunID, &v.SourceName, &v.FeedURL, &v.OriginalURL, &v.GUID, &v.Title, &v.PublishedAt, &v.FetchedAt, &v.Summary, &v.DedupeKey); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Claim serializes a day with the database unique key. A failed run can be reclaimed; a success/running run is returned unchanged.
func (r *Repository) Claim(ctx context.Context, date time.Time, trigger string) (*domain.DailyNewsRun, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	var id int64
	err = tx.QueryRowContext(ctx, "INSERT INTO ai_daily_news_runs(run_date,status,trigger,started_at) VALUES($1,'running',$2,NOW()) ON CONFLICT(run_date) DO UPDATE SET status='running',trigger=EXCLUDED.trigger,started_at=NOW(),finished_at=NULL,error_message=NULL WHERE ai_daily_news_runs.status='failed' RETURNING id", date, trigger).Scan(&id)
	if err == sql.ErrNoRows {
		var v *domain.DailyNewsRun
		v, err = scanRun(tx.QueryRowContext(ctx, "SELECT "+runColumns+" FROM ai_daily_news_runs WHERE run_date=$1", date))
		if err != nil {
			return nil, false, err
		}
		return v, false, tx.Commit()
	}
	if err != nil {
		return nil, false, err
	}
	v, err := scanRun(tx.QueryRowContext(ctx, "SELECT "+runColumns+" FROM ai_daily_news_runs WHERE id=$1", id))
	if err != nil {
		return nil, false, err
	}
	return v, true, tx.Commit()
}
func (r *Repository) SaveSources(ctx context.Context, runID int64, values []domain.DailyNewsSource) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "DELETE FROM ai_daily_news_sources WHERE run_id=$1", runID); err != nil {
		return err
	}
	for _, v := range values {
		if _, err = tx.ExecContext(ctx, "INSERT INTO ai_daily_news_sources(run_id,source_name,feed_url,original_url,guid,title,published_at,fetched_at,summary,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", runID, v.SourceName, v.FeedURL, v.OriginalURL, v.GUID, v.Title, v.PublishedAt, v.FetchedAt, v.Summary, v.DedupeKey); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (r *Repository) Finish(ctx context.Context, runID int64, status string, count int, postID *int64, provider, model string, retries int, errmsg string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE ai_daily_news_runs SET status=$2,source_count=$3,post_id=$4,provider=$5,model=$6,retry_count=$7,error_message=NULLIF($8,''),finished_at=NOW() WHERE id=$1", runID, status, count, postID, provider, model, retries, errmsg)
	return err
}
func (r *Repository) MarkSuccessDate(ctx context.Context, date time.Time) error {
	_, err := r.db.ExecContext(ctx, "UPDATE ai_daily_news_jobs SET last_successful_date=$1,updated_at=NOW() WHERE id=1", date)
	return err
}
