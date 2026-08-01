CREATE TABLE IF NOT EXISTS ai_media_candidates (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    source_run_id BIGINT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE RESTRICT,
    source_approval_id BIGINT NOT NULL UNIQUE REFERENCES ai_approvals(id) ON DELETE RESTRICT,
    headline TEXT NOT NULL DEFAULT '',
    brief TEXT NOT NULL,
    platform VARCHAR(100) NOT NULL DEFAULT '',
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(120) NOT NULL,
    generation_status VARCHAR(30) NOT NULL DEFAULT 'brief_ready',
    safety_status VARCHAR(30) NOT NULL DEFAULT 'not_checked',
    copyright_status VARCHAR(30) NOT NULL DEFAULT 'not_checked',
    alt_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_media_candidate_generation_check CHECK (generation_status IN ('brief_ready','generated','rejected','failed')),
    CONSTRAINT ai_media_candidate_safety_check CHECK (safety_status IN ('not_checked','passed','flagged')),
    CONSTRAINT ai_media_candidate_copyright_check CHECK (copyright_status IN ('not_checked','passed','flagged'))
);

CREATE INDEX IF NOT EXISTS idx_ai_media_candidates_created
    ON ai_media_candidates (generation_status, created_at DESC);
