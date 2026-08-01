CREATE TABLE IF NOT EXISTS ai_daily_news_jobs (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cron_expression VARCHAR(80) NOT NULL DEFAULT '0 9 * * *',
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
    last_successful_date DATE,
    created_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_daily_news_runs (
    id BIGSERIAL PRIMARY KEY,
    run_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    source_count INT NOT NULL DEFAULT 0,
    post_id INT REFERENCES posts(id) ON DELETE SET NULL,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_date)
);

INSERT INTO ai_daily_news_jobs (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
