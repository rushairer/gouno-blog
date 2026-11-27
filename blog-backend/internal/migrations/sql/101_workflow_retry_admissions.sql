-- The retry admission is evidence of a possible attempt, not proof of dispatch.
-- Retain it for the lifetime of the source Run, independently of retry deletion.
LOCK TABLE ai_workflow_runs IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE ai_workflow_retry_admissions (
    source_run_id BIGINT NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL CHECK (iteration >= 0),
    PRIMARY KEY (source_run_id, iteration)
);

-- Historical duplicates collapse to a consumed index. Malformed retained
-- selections fail migration rather than silently authorizing a fresh replay.
INSERT INTO ai_workflow_retry_admissions (source_run_id, iteration)
SELECT r.retry_of_run_id, item.value::text::integer
FROM ai_workflow_runs r
CROSS JOIN LATERAL jsonb_array_elements(r.retry_iterations) AS item(value)
WHERE r.retry_of_run_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE FUNCTION record_ai_workflow_retry_admission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.retry_of_run_id IS NULL AND NEW.trigger_kind <> 'retry' THEN
        RETURN NEW;
    END IF;

    IF NEW.trigger_kind <> 'retry' OR NEW.retry_of_run_id IS NULL
       OR jsonb_array_length(NEW.retry_iterations) = 0
       OR NOT EXISTS (
           SELECT 1 FROM ai_workflow_runs s
           WHERE s.id = NEW.retry_of_run_id
             AND s.trigger_kind <> 'retry' AND s.retry_of_run_id IS NULL
       ) THEN
        RAISE EXCEPTION 'invalid workflow retry admission' USING ERRCODE = '23514';
    END IF;

    -- No ON CONFLICT: overlapping or duplicate indices reject the entire
    -- retry INSERT, even for callers that do not use the application guard.
    INSERT INTO ai_workflow_retry_admissions (source_run_id, iteration)
    SELECT NEW.retry_of_run_id, item.value::text::integer
    FROM jsonb_array_elements(NEW.retry_iterations) AS item(value);

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_record_ai_workflow_retry_admission
BEFORE INSERT ON ai_workflow_runs
FOR EACH ROW EXECUTE FUNCTION record_ai_workflow_retry_admission();
