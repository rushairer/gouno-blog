ALTER TABLE ai_provider_profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ai_provider_profiles
DROP CONSTRAINT IF EXISTS ai_provider_profiles_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_profiles_name_active
ON ai_provider_profiles (name)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_active
ON ai_provider_profiles (enabled, name)
WHERE deleted_at IS NULL;
