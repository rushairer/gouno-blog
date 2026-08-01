ALTER TABLE ai_provider_profiles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_profiles_one_default
ON ai_provider_profiles ((is_default)) WHERE is_default=true AND deleted_at IS NULL;
