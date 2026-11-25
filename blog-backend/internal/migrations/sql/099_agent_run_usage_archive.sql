-- Preserve only the minimal observed aggregate needed by the existing
-- run-creation-month budget policy when a terminal Agent Run is deleted.
-- No prompt, tool payload, Provider body or identity FK is retained.
CREATE TABLE ai_agent_run_usage_archive (
    source_run_id BIGINT PRIMARY KEY CHECK (source_run_id > 0),
    agent_id BIGINT NOT NULL CHECK (agent_id > 0),
    run_created_at TIMESTAMPTZ NOT NULL,
    input_tokens BIGINT NOT NULL CHECK (input_tokens >= 0),
    output_tokens BIGINT NOT NULL CHECK (output_tokens >= 0),
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (input_tokens > 0 OR output_tokens > 0)
);

CREATE INDEX idx_ai_agent_run_usage_archive_agent_month
    ON ai_agent_run_usage_archive(agent_id, run_created_at);

CREATE FUNCTION archive_ai_agent_run_usage_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    archived_input NUMERIC;
    archived_output NUMERIC;
BEGIN
    SELECT
        GREATEST(OLD.input_tokens::NUMERIC, COALESCE(SUM(u.input_tokens), 0)),
        GREATEST(OLD.output_tokens::NUMERIC, COALESCE(SUM(u.output_tokens), 0))
    INTO archived_input, archived_output
    FROM ai_usage_events u
    WHERE u.run_id = OLD.id;

    IF archived_input > 0 OR archived_output > 0 THEN
        INSERT INTO ai_agent_run_usage_archive (
            source_run_id, agent_id, run_created_at, input_tokens, output_tokens
        ) VALUES (
            OLD.id, OLD.agent_id, OLD.created_at, archived_input, archived_output
        )
        ON CONFLICT (source_run_id) DO NOTHING;
    END IF;

    RETURN OLD;
END;
$$;

-- A database trigger covers both direct Run deletion and Workflow-owned
-- bulk deletion; the archive participates in the same transaction as DELETE.
CREATE TRIGGER trg_archive_ai_agent_run_usage_before_delete
BEFORE DELETE ON ai_agent_runs
FOR EACH ROW
EXECUTE FUNCTION archive_ai_agent_run_usage_before_delete();
