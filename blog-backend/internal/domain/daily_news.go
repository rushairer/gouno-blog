package domain

import "time"

type DailyNewsJob struct {
	Enabled bool `json:"enabled"`
	CronExpression string `json:"cron_expression"`
	Timezone string `json:"timezone"`
	LastSuccessfulDate *time.Time `json:"last_successful_date,omitempty"`
	CreatedBy *string `json:"created_by,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

type DailyNewsRun struct {
	ID int64 `json:"id"`
	RunDate time.Time `json:"run_date"`
	Status string `json:"status"`
	Trigger string `json:"trigger"`
	SourceCount int `json:"source_count"`
	PostID *int64 `json:"post_id,omitempty"`
	Provider string `json:"provider,omitempty"`
	Model string `json:"model,omitempty"`
	RetryCount int `json:"retry_count"`
	ErrorMessage string `json:"error_message,omitempty"`
	StartedAt *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type DailyNewsSource struct {
	ID int64 `json:"id"`
	RunID int64 `json:"run_id"`
	SourceName string `json:"source_name"`
	FeedURL string `json:"feed_url"`
	OriginalURL string `json:"original_url"`
	GUID string `json:"guid,omitempty"`
	Title string `json:"title"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	FetchedAt time.Time `json:"fetched_at"`
	Summary string `json:"summary,omitempty"`
	DedupeKey string `json:"dedupe_key"`
}

type DailyNewsStatus struct {
	Job DailyNewsJob `json:"job"`
	NextRunAt *time.Time `json:"next_run_at,omitempty"`
	LatestRun *DailyNewsRun `json:"latest_run,omitempty"`
	Sources []DailyNewsSource `json:"sources"`
}
