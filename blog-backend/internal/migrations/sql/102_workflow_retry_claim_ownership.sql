-- Keep the exact retry identity independently of retry Run deletion.
-- Unknown historical ownership remains consumed but cannot authorize dispatch.
LOCK TABLE ai_workflow_runs IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE ai_workflow_retry_admissions IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE ai_workflow_retry_admissions ADD COLUMN retry_run_id BIGINT;

-- Only a unique extant historical selection supplies a candidate owner.
-- Overlapping or missing history is deliberately left unowned; deleting a
-- duplicate after this migration cannot turn ambiguity into authorization.
UPDATE ai_workflow_retry_admissions a
SET retry_run_id = history.retry_run_id
FROM (
    SELECT r.retry_of_run_id AS source_run_id,
           item.value::text::integer AS iteration,
           MIN(r.id) AS retry_run_id
    FROM ai_workflow_runs r
    CROSS JOIN LATERAL jsonb_array_elements(r.retry_iterations) AS item(value)
    WHERE r.retry_of_run_id IS NOT NULL
    GROUP BY r.retry_of_run_id, item.value::text::integer
    HAVING COUNT(*) = 1
) history
WHERE a.source_run_id = history.source_run_id
  AND a.iteration = history.iteration;

CREATE OR REPLACE FUNCTION record_ai_workflow_retry_admission()
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
    INSERT INTO ai_workflow_retry_admissions (source_run_id, iteration, retry_run_id)
    SELECT NEW.retry_of_run_id, item.value::text::integer, NEW.id
    FROM jsonb_array_elements(NEW.retry_iterations) AS item(value);

    RETURN NEW;
END;
$$;
