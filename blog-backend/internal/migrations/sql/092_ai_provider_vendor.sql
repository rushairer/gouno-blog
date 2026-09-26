-- Separate commercial vendor identity from the wire protocol family kept in provider_type.
-- Existing rows remain compatible and are backfilled deterministically.

ALTER TABLE ai_provider_profiles
    ADD COLUMN IF NOT EXISTS vendor VARCHAR(64) NOT NULL DEFAULT '';

UPDATE ai_provider_profiles
SET vendor = CASE provider_type
    WHEN 'anthropic' THEN 'anthropic'
    WHEN 'gemini' THEN 'google'
    ELSE 'openai'
END
WHERE vendor = '';
