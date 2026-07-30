CREATE TABLE IF NOT EXISTS ai_editorial_tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    source_approval_id BIGINT NOT NULL UNIQUE REFERENCES ai_approvals(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_editorial_task_priority_check CHECK (priority IN ('low', 'medium', 'high')),
    CONSTRAINT ai_editorial_task_status_check CHECK (status IN ('open', 'done', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS ai_comment_reply_drafts (
    id BIGSERIAL PRIMARY KEY,
    comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    source_approval_id BIGINT NOT NULL UNIQUE REFERENCES ai_approvals(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_reply_draft_status_check CHECK (status IN ('draft', 'used', 'discarded'))
);

CREATE INDEX IF NOT EXISTS idx_ai_editorial_tasks_status_created
ON ai_editorial_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reply_drafts_comment
ON ai_comment_reply_drafts (comment_id, created_at DESC);
