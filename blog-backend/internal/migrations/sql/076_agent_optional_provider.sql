ALTER TABLE ai_agents ALTER COLUMN provider_profile_id DROP NOT NULL;

-- Migrate system starter agents to inherit global default text model
UPDATE ai_agents SET provider_profile_id = NULL WHERE system_key IS NOT NULL;
