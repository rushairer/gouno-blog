-- Image generation may legitimately take several minutes. Keep the default
-- timeout unchanged, but let an administrator configure a longer bound.
ALTER TABLE ai_provider_profiles
    DROP CONSTRAINT IF EXISTS ai_provider_timeout_check;

ALTER TABLE ai_provider_profiles
    ADD CONSTRAINT ai_provider_timeout_check
    CHECK (request_timeout_seconds BETWEEN 1 AND 1800);
