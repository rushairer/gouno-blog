CREATE TABLE IF NOT EXISTS ai_content_candidate_sets (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    source_run_id BIGINT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE RESTRICT,
    source_approval_id BIGINT NOT NULL UNIQUE REFERENCES ai_approvals(id) ON DELETE RESTRICT,
    field_type VARCHAR(30) NOT NULL,
    before_value TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    selected_candidate_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_content_candidate_field_check CHECK (field_type IN ('title','summary','cover_alt')),
    CONSTRAINT ai_content_candidate_set_status_check CHECK (status IN ('pending','selected','expired'))
);

CREATE TABLE IF NOT EXISTS ai_content_candidates (
    id BIGSERIAL PRIMARY KEY,
    candidate_set_id BIGINT NOT NULL REFERENCES ai_content_candidate_sets(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    rationale TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_content_candidate_selected_fk') THEN
        ALTER TABLE ai_content_candidate_sets
            ADD CONSTRAINT ai_content_candidate_selected_fk
            FOREIGN KEY (selected_candidate_id) REFERENCES ai_content_candidates(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_content_candidate_sets_status
    ON ai_content_candidate_sets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_feedback (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(30) NOT NULL,
    target_id BIGINT NOT NULL,
    label VARCHAR(20) NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_feedback_target_check CHECK (target_type IN ('run','approval','suggestion')),
    CONSTRAINT ai_feedback_label_check CHECK (label IN ('adopted','rejected','invalid')),
    UNIQUE (target_type, target_id, created_by)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_target
    ON ai_feedback (target_type, target_id, label);
