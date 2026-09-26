ALTER TABLE ai_provider_profiles
    ADD COLUMN IF NOT EXISTS vendor VARCHAR(40) NOT NULL DEFAULT 'custom';

UPDATE ai_provider_profiles
SET vendor = CASE provider_type
    WHEN 'anthropic' THEN 'anthropic'
    WHEN 'gemini' THEN 'google'
    ELSE 'openai'
END
WHERE vendor = 'custom';

ALTER TABLE ai_provider_profiles
    DROP CONSTRAINT IF EXISTS ai_provider_vendor_check;

ALTER TABLE ai_provider_profiles
    ADD CONSTRAINT ai_provider_vendor_check CHECK (
        vendor IN (
            'custom',
            'openai',
            'anthropic',
            'google',
            'deepseek',
            'alibaba_bailian',
            'volcengine_ark',
            'tencent_hunyuan',
            'baidu_qianfan',
            'moonshot',
            'zhipu',
            'siliconflow',
            'minimax'
        )
    );

COMMENT ON COLUMN ai_provider_profiles.vendor IS
    'Human-facing model platform identity. Runtime dispatch remains owned by provider_type protocol family.';
