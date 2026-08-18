-- Expand resource type constraint to include 'page'
ALTER TABLE ai_workflow_run_resources DROP CONSTRAINT IF EXISTS ai_workflow_run_resource_type_check;
ALTER TABLE ai_workflow_run_resources ADD CONSTRAINT ai_workflow_run_resource_type_check CHECK (
    resource_type IN ('post','comment','media_asset','operational_suggestion','category','tag','page')
);

-- Seed page review Skill
WITH seed(system_key, name, description, prompt, capabilities, execution_mode) AS (
    VALUES (
        'page_review',
        '单页内容与SEO审校',
        '检查单页内容质量、结构、内外部链接与 SEO 元数据。',
        '对指定单页执行内容审校与 SEO 分析，使用授权的读取工具收集证据，输出具体、可核验的修改建议；需要改动时仅提出单页更新审批提案。',
        '["content.get_page","content.audit_page","content.check_page_links","content.search_knowledge","content.propose_page_update"]'::jsonb,
        'approval'
    )
)
INSERT INTO ai_skills(system_key, name, description, system_prompt, capabilities, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers)
SELECT system_key, name, description, prompt, capabilities, execution_mode, 'approval', 8, 24000, 4000, 10, 300000,
    '{"type":"object","additionalProperties":true}'::jsonb, '["manual","cron"]'::jsonb FROM seed
ON CONFLICT(name) DO UPDATE SET
    system_key = EXCLUDED.system_key,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    capabilities = EXCLUDED.capabilities;

INSERT INTO ai_skill_versions(skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, created_by)
SELECT s.id, s.version, s.system_prompt, s.capabilities, s.tool_bindings, s.execution_mode, s.content_publish_mode, s.max_steps, s.max_input_tokens, s.max_output_tokens,
    s.default_daily_run_limit, s.default_monthly_token_budget, s.input_schema, s.allowed_triggers, s.created_by
FROM ai_skills s
WHERE s.system_key = 'page_review' AND s.deleted_at IS NULL
ON CONFLICT (skill_id, version) DO NOTHING;

-- Seed system Agent for page review if a provider exists
WITH provider AS (
    SELECT id FROM ai_provider_profiles WHERE enabled AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
    ORDER BY is_default_writing DESC, created_at LIMIT 1
), skill AS (
    SELECT s.system_key, s.name, s.description, s.default_daily_run_limit, s.default_monthly_token_budget, sv.id AS version_id
    FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id = s.id AND sv.version = s.version
    WHERE s.system_key = 'page_review' AND s.deleted_at IS NULL
)
INSERT INTO ai_agents(system_key, name, description, provider_profile_id, skill_version_id, enabled, trigger_type, timezone, daily_run_limit, monthly_token_budget)
SELECT s.system_key, s.name, s.description, p.id, s.version_id, FALSE, 'manual', 'Asia/Shanghai', s.default_daily_run_limit, s.default_monthly_token_budget
FROM skill s CROSS JOIN provider p
ON CONFLICT (name) DO NOTHING;

-- Starter Workflow 1: Manual batch page review
WITH templates(template_key, name, description) AS (
    VALUES (
        'selected_page_review',
        '单页审校与优化（手选）',
        '审校手选单页并为每页生成可核验的优化建议。'
    )
)
INSERT INTO ai_workflows(name, description, enabled, template_key, timezone, current_version)
SELECT name, description, FALSE, template_key, 'Asia/Shanghai', 1 FROM templates
ON CONFLICT(template_key) WHERE deleted_at IS NULL AND template_key IS NOT NULL DO NOTHING;

WITH templates(template_key, agent_key, input_schema, scope_policy, collection) AS (
    VALUES (
        'selected_page_review',
        'page_review',
        '{"type":"object","additionalProperties":false,"required":["page_ids"],"properties":{"page_ids":{"title":"单页","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"page","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
        '{"mode":"strict","discovery_tools":["content.search_knowledge"]}'::jsonb,
        '/input/page_ids'
    )
)
INSERT INTO ai_workflow_versions(workflow_id, version, input_schema, steps, scope_policy)
SELECT w.id, w.current_version, t.input_schema,
    jsonb_build_array(jsonb_build_object('id','batch','type','for_each','collection_pointer',t.collection,'max_items',20,'steps',
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id','agent','type','model','agent_id',sa.id,'include_context',TRUE)))))
    || jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate'))
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    t.scope_policy
FROM templates t
JOIN ai_workflows w ON w.template_key = t.template_key AND w.deleted_at IS NULL
LEFT JOIN ai_agents sa ON sa.system_key = t.agent_key AND sa.deleted_at IS NULL
ON CONFLICT (workflow_id, version) DO NOTHING;

-- Starter Workflow 2: Scheduled page review
INSERT INTO ai_workflows(name, description, enabled, template_key, cron_expression, timezone, current_version, resource_query_empty_policy)
VALUES ('定期单页健康审查', '定期调度单页审校 Agent，审查超过 90 天未更新的单页。', FALSE, 'scheduled_page_review', '0 10 1 * *', 'Asia/Shanghai', 1, 'succeed')
ON CONFLICT(template_key) WHERE deleted_at IS NULL AND template_key IS NOT NULL DO NOTHING;

WITH agent AS (SELECT id FROM ai_agents WHERE system_key = 'page_review' AND deleted_at IS NULL LIMIT 1)
INSERT INTO ai_workflow_versions(workflow_id, version, input_schema, steps, scope_policy)
SELECT w.id, w.current_version, '{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id','select_pages','type','resource_query','resource_type','page','filter',jsonb_build_object('updated_before_days',90),'max_items',20),
      jsonb_build_object('id','batch','type','for_each','collection_pointer','/steps/select_pages','max_items',20,'steps',jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id,'include_context',TRUE))),
      jsonb_build_object('id','approval','type','approval_gate'),jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    '{"mode":"strict","discovery_tools":["content.search_knowledge"]}'::jsonb
FROM ai_workflows w
LEFT JOIN agent a ON TRUE
WHERE w.template_key = 'scheduled_page_review' AND w.deleted_at IS NULL
ON CONFLICT (workflow_id, version) DO NOTHING;

