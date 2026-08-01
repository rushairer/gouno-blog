ALTER TABLE ai_provider_profiles DROP CONSTRAINT IF EXISTS ai_provider_type_check;
ALTER TABLE ai_provider_profiles ADD CONSTRAINT ai_provider_type_check CHECK (provider_type IN ('openai', 'anthropic', 'gemini'));
