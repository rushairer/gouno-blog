-- Repair starter workflows created by the earlier workflow prototypes. This is
-- deliberately a forward migration: deployed databases may have recorded 037
-- while still pointing their current workflow version at an older definition.

WITH provider AS (
    SELECT id
    FROM ai_provider_profiles
    WHERE enabled=TRUE AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
    ORDER BY is_default_writing DESC, created_at ASC
    LIMIT 1
), skills AS (
    SELECT s.system_key, s.name, s.description, s.system_prompt, s.capabilities,
        s.execution_mode, s.max_steps, s.max_input_tokens, s.max_output_tokens,
        s.daily_run_limit, s.monthly_token_budget, sv.id AS skill_version_id
    FROM ai_skills s
    JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
    WHERE s.system_key IS NOT NULL AND s.deleted_at IS NULL
)
INSERT INTO ai_agents (
    system_key, name, description, system_prompt, provider_profile_id, skill_version_id,
    enabled, trigger_type, timezone, capabilities, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget
)
SELECT s.system_key, s.name, s.description, s.system_prompt, p.id, s.skill_version_id,
    FALSE, 'manual', 'Asia/Shanghai', s.capabilities, s.execution_mode, 'approval',
    s.max_steps, s.max_input_tokens, s.max_output_tokens, s.daily_run_limit, s.monthly_token_budget
FROM skills s CROSS JOIN provider p
ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING;

-- A repaired installation with a usable Provider already has its starter
-- Agents. Mark bootstrap complete so a later Provider save cannot duplicate it.
INSERT INTO ai_workspace_bootstrap (singleton, version, provider_profile_id)
SELECT TRUE, 1, p.id
FROM (SELECT id FROM ai_provider_profiles WHERE enabled=TRUE AND deleted_at IS NULL
      AND api_key_ciphertext IS NOT NULL ORDER BY is_default_writing DESC, created_at ASC LIMIT 1) p
WHERE (SELECT COUNT(*) FROM ai_agents WHERE system_key IS NOT NULL AND deleted_at IS NULL) = 8
ON CONFLICT (singleton) DO NOTHING;

WITH templates(template_key, name, description, cron_expression, needs_gate) AS (
    VALUES
    ('daily_news', 'AI 每日资讯', '每天 09:00 调度 AI 每日资讯 Agent。', '0 9 * * *', FALSE),
    ('weekly_operations', '周度运营复盘', '每周调度周度运营复盘 Agent。', '0 9 * * 1', FALSE),
    ('stale_content_refresh', '陈旧内容更新', '定期调度陈旧内容更新 Agent。', '0 9 * * 2', TRUE),
    ('low_engagement', '低互动文章分析', '定期调度低互动文章分析 Agent。', '0 9 * * 3', FALSE)
), updated AS (
    UPDATE ai_workflows w
    SET name=t.name, description=t.description, enabled=FALSE,
        cron_expression=t.cron_expression, timezone='Asia/Shanghai', next_run_at=NULL,
        current_version=w.current_version+1, updated_at=NOW()
    FROM templates t
    WHERE w.template_key=t.template_key AND w.deleted_at IS NULL
    RETURNING w.id, w.template_key, w.current_version
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT u.id, u.current_version, '{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', 'agent', 'type', 'model', 'agent_id', a.id)))
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id', 'approval', 'type', 'approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id', 'result', 'type', 'output', 'output_pointer', '/steps/agent'))
FROM updated u
JOIN templates t USING (template_key)
LEFT JOIN ai_agents a ON a.system_key=u.template_key AND a.deleted_at IS NULL;
