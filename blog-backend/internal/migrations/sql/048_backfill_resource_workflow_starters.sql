-- Complete the resource-oriented starter chain after 046/047. A data-changing
-- CTE is not visible to an unrelated table scan in the same statement, so 046
-- could create Skills without their immutable Skill Versions on some installs.
INSERT INTO ai_skill_versions(skill_id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,
    max_steps,max_input_tokens,max_output_tokens,default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers,created_by)
SELECT s.id,s.version,s.system_prompt,s.capabilities,s.tool_bindings,s.execution_mode,s.content_publish_mode,
    s.max_steps,s.max_input_tokens,s.max_output_tokens,s.default_daily_run_limit,s.default_monthly_token_budget,s.input_schema,s.allowed_triggers,s.created_by
FROM ai_skills s
WHERE s.name IN ('媒体无障碍检查','分类与标签整理','运营建议深挖','混合内容复盘')
  AND NOT EXISTS (SELECT 1 FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version);

WITH provider AS (
    SELECT id FROM ai_provider_profiles
    WHERE enabled AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
    ORDER BY is_default_writing DESC, created_at
    LIMIT 1
), skills AS (
    SELECT s.name,s.description,s.default_daily_run_limit,s.default_monthly_token_budget,sv.id AS version_id
    FROM ai_skills s
    JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
    WHERE s.name IN ('媒体无障碍检查','分类与标签整理','运营建议深挖','混合内容复盘')
)
INSERT INTO ai_agents(name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget)
SELECT s.name,s.description,p.id,s.version_id,FALSE,'manual','Asia/Shanghai',s.default_daily_run_limit,s.default_monthly_token_budget
FROM skills s CROSS JOIN provider p
ON CONFLICT(name) DO NOTHING;

WITH templates(template_key,name,description) AS (
    VALUES
    ('selected_taxonomy_review','分类与标签整理','联合分析手选分类与标签的结构质量。'),
    ('selected_mixed_review','混合内容复盘','联合复盘手选文章、评论和运营建议。')
)
INSERT INTO ai_workflows(name,description,enabled,template_key,timezone,current_version)
SELECT name,description,FALSE,template_key,'Asia/Shanghai',1 FROM templates
ON CONFLICT(template_key) DO NOTHING;

WITH templates(template_key,agent_name,input_schema) AS (
    VALUES
    ('selected_taxonomy_review','分类与标签整理',
     '{"type":"object","additionalProperties":false,"properties":{"category_ids":{"title":"分类","type":"array","items":{"type":"integer"},"maxItems":30,"x-gouno-resource":"category","x-gouno-widget":"entity-multi-select"},"tags":{"title":"标签","type":"array","items":{"type":"string"},"maxItems":30,"x-gouno-resource":"tag","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["category_ids"]},{"required":["tags"]}]}'::jsonb),
    ('selected_mixed_review','混合内容复盘',
     '{"type":"object","additionalProperties":false,"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"comment_ids":{"title":"评论","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"comment","x-gouno-widget":"entity-multi-select"},"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["post_ids"]},{"required":["comment_ids"]},{"required":["suggestion_ids"]}]}'::jsonb)
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT w.id,w.current_version,t.input_schema,
    jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id),
        jsonb_build_object('id','result','type','output','output_pointer','/steps/agent')),
    '{"mode":"strict","discovery_tools":[]}'::jsonb
FROM templates t
JOIN ai_workflows w ON w.template_key=t.template_key
JOIN ai_agents a ON a.name=t.agent_name AND a.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM ai_workflow_versions v WHERE v.workflow_id=w.id AND v.version=w.current_version)
ON CONFLICT(workflow_id,version) DO NOTHING;

WITH templates(template_key,agent_name,input_schema,collection,needs_gate) AS (
    VALUES
    ('selected_media_review','媒体无障碍检查',
     '{"type":"object","additionalProperties":false,"required":["media_ids"],"properties":{"media_ids":{"title":"媒体","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":30,"x-gouno-resource":"media_asset","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '/input/media_ids',FALSE),
    ('selected_operations_deep_dive','运营建议深挖',
     '{"type":"object","additionalProperties":false,"required":["suggestion_ids"],"properties":{"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '/input/suggestion_ids',TRUE)
), bumped AS (
    UPDATE ai_workflows w SET current_version=w.current_version+1,updated_at=NOW()
    FROM templates t, ai_workflow_versions v, ai_agents a
    WHERE w.template_key=t.template_key
      AND v.workflow_id=w.id AND v.version=w.current_version
      AND a.name=t.agent_name AND a.deleted_at IS NULL
      AND v.steps::text NOT LIKE '%"agent_id"%'
    RETURNING w.id,w.template_key,w.current_version
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT b.id,b.current_version,t.input_schema,
    jsonb_build_array(jsonb_build_object('id','batch','type','for_each','collection_pointer',t.collection,'max_items',20,'steps',
        jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id,'include_context',TRUE))))
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    '{"mode":"strict","discovery_tools":[]}'::jsonb
FROM bumped b
JOIN templates t USING(template_key)
JOIN ai_agents a ON a.name=t.agent_name AND a.deleted_at IS NULL;
