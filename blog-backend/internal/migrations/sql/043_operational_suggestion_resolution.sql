-- Operational suggestions need a distinct terminal state for conditions that
-- disappear after a fresh health check. Keep ignored as an explicit operator
-- decision so a later refresh can explain why an item is no longer actionable.
ALTER TABLE ai_operational_suggestions
    DROP CONSTRAINT IF EXISTS ai_operational_suggestion_status_check;

ALTER TABLE ai_operational_suggestions
    ADD CONSTRAINT ai_operational_suggestion_status_check
    CHECK (status IN ('new','ignored','converted','selected','resolved'));
