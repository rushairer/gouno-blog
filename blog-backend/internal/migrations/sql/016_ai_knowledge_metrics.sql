CREATE TABLE IF NOT EXISTS ai_retrieval_metrics (
    id BIGSERIAL PRIMARY KEY,
    query_hash VARCHAR(64) NOT NULL,
    latency_ms BIGINT NOT NULL,
    result_count INT NOT NULL,
    succeeded BOOLEAN NOT NULL,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_retrieval_metrics_created
    ON ai_retrieval_metrics (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_retrieval_eval_cases (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    query TEXT NOT NULL,
    expected_post_ids JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
