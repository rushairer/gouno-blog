-- Add optional stream_mode column to ai_provider_profiles
ALTER TABLE ai_provider_profiles
    ADD COLUMN IF NOT EXISTS stream_mode VARCHAR(32) NOT NULL DEFAULT 'auto';
