-- Add optional protocol_mode column to ai_provider_profiles
ALTER TABLE ai_provider_profiles
    ADD COLUMN IF NOT EXISTS protocol_mode VARCHAR(64) NOT NULL DEFAULT '';
