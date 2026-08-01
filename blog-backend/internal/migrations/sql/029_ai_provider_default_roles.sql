ALTER TABLE ai_provider_profiles RENAME COLUMN is_default TO is_default_writing;
ALTER TABLE ai_provider_profiles ADD COLUMN is_default_image BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS idx_ai_provider_profiles_one_default;
CREATE UNIQUE INDEX idx_ai_provider_profiles_one_default_writing ON ai_provider_profiles ((is_default_writing)) WHERE is_default_writing=true AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_ai_provider_profiles_one_default_image ON ai_provider_profiles ((is_default_image)) WHERE is_default_image=true AND deleted_at IS NULL;
