ALTER TABLE ai_daily_news_runs
    ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) NOT NULL DEFAULT 'schedule',
    ADD COLUMN IF NOT EXISTS provider VARCHAR(40),
    ADD COLUMN IF NOT EXISTS model VARCHAR(160),
    ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_daily_news_sources (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES ai_daily_news_runs(id) ON DELETE CASCADE,
    source_name VARCHAR(120) NOT NULL,
    feed_url TEXT NOT NULL,
    original_url TEXT NOT NULL,
    guid TEXT,
    title TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    dedupe_key VARCHAR(128) NOT NULL,
    UNIQUE (run_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_daily_news_sources_run ON ai_daily_news_sources(run_id);
