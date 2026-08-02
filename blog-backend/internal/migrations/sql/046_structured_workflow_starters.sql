-- Resource-oriented Skills do not use system_key so the eight-item platform
-- bootstrap contract remains stable. They become ready-to-bind templates even
-- on installations that have not configured a Provider yet.
WITH seed(name,description,prompt,capabilities,execution_mode) AS (
    VALUES
    ('媒体无障碍检查','检查已选媒体的替代文字与复用情况。','逐项读取所选媒体元数据，输出缺失或低质量 Alt 文本、格式和复用建议。不要删除或发布任何媒体。','["media.get_asset"]'::jsonb,'advisory'),
    ('分类与标签整理','分析已选分类和标签的结构质量。','分析输入中的分类和标签，使用授权的聚合工具识别重复、孤立、过宽或过窄的结构，只输出建议。','["content.list_categories","content.list_tags","content.list_posts"]'::jsonb,'advisory'),
    ('运营建议深挖','补充已选运营建议的证据和执行优先级。','读取指定运营建议，补充风险、证据和下一步；需要跟进时只创建编辑任务提案。','["operations.get_suggestion","content.propose_task"]'::jsonb,'approval'),
    ('混合内容复盘','联合分析文章、评论与运营建议。','只读取输入中指定的文章、评论和运营建议，输出共同主题、风险和可执行的编辑计划。','["content.get_post","comments.get_comment","operations.get_suggestion","content.propose_task"]'::jsonb,'approval')
), inserted AS (
    INSERT INTO ai_skills(name,description,system_prompt,capabilities,execution_mode,content_publish_mode,
        max_steps,max_input_tokens,max_output_tokens,default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers)
    SELECT name,description,prompt,capabilities,execution_mode,'approval',8,24000,4000,10,300000,
        '{"type":"object","additionalProperties":true}'::jsonb,'["manual"]'::jsonb FROM seed
    ON CONFLICT(name) DO NOTHING
    RETURNING id
)
INSERT INTO ai_skill_versions(skill_id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,
    max_steps,max_input_tokens,max_output_tokens,default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers,created_by)
SELECT id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,max_steps,max_input_tokens,max_output_tokens,
    default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers,created_by
FROM ai_skills s WHERE s.name IN (SELECT name FROM seed)
AND NOT EXISTS(SELECT 1 FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version);

-- Selected comments need a direct, scope-aware read instead of widening a run
-- with comments.list_pending. Upgrade only the platform-managed Agent.
WITH updated AS (
    UPDATE ai_skills SET capabilities='["comments.get_comment","comments.propose_reply"]'::jsonb,
        version=version+1,updated_at=NOW()
    WHERE system_key='comment_reply_draft' AND NOT capabilities ? 'comments.get_comment'
    RETURNING *
), versioned AS (
    INSERT INTO ai_skill_versions(skill_id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,
        max_steps,max_input_tokens,max_output_tokens,default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers,created_by)
    SELECT id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,max_steps,max_input_tokens,max_output_tokens,
        default_daily_run_limit,default_monthly_token_budget,input_schema,allowed_triggers,created_by FROM updated
    RETURNING skill_id,id
)
UPDATE ai_agents a SET skill_version_id=v.id,updated_at=NOW() FROM versioned v JOIN ai_skills s ON s.id=v.skill_id
WHERE a.system_key='comment_reply_draft' AND a.deleted_at IS NULL;

WITH provider AS (
    SELECT id FROM ai_provider_profiles WHERE enabled AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
    ORDER BY is_default_writing DESC,created_at LIMIT 1
), skills AS (
    SELECT s.name,s.description,s.default_daily_run_limit,s.default_monthly_token_budget,sv.id AS version_id
    FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
    WHERE s.name IN ('媒体无障碍检查','分类与标签整理','运营建议深挖','混合内容复盘')
)
INSERT INTO ai_agents(name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget)
SELECT s.name,s.description,p.id,s.version_id,FALSE,'manual','Asia/Shanghai',s.default_daily_run_limit,s.default_monthly_token_budget
FROM skills s CROSS JOIN provider p ON CONFLICT(name) DO NOTHING;

WITH templates(template_key,name,description,agent_key,agent_name,input_schema,scope_policy,collection,needs_gate) AS (
    VALUES
    ('selected_pre_publish_review','批量发布前审校','审校手选文章并为每篇生成可核验建议。','pre_publish_review',NULL,
     '{"type":"object","additionalProperties":false,"required":["post_ids"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '{"mode":"strict","discovery_tools":["content.search_knowledge"]}'::jsonb,'/input/post_ids',TRUE),
    ('selected_internal_linking','站内链接优化（手选）','为手选文章发现相关内链，只允许修改原目标。','internal_linking',NULL,
     '{"type":"object","additionalProperties":false,"required":["post_ids"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '{"mode":"strict","discovery_tools":["content.find_internal_links"]}'::jsonb,'/input/post_ids',TRUE),
    ('selected_distribution','内容再分发（手选）','为手选文章生成社媒、Newsletter、FAQ 或图片 Brief。','content_distribution',NULL,
     '{"type":"object","additionalProperties":false,"required":["post_ids","format"],"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"format":{"title":"输出格式","type":"string","enum":["social","newsletter","faq","image_brief"]}}}'::jsonb,
     '{"mode":"strict","discovery_tools":[]}'::jsonb,'/input/post_ids',TRUE),
    ('selected_comment_replies','评论回复草稿（手选）','为手选评论逐条创建待审批回复草稿。','comment_reply_draft',NULL,
     '{"type":"object","additionalProperties":false,"required":["comment_ids"],"properties":{"comment_ids":{"title":"评论","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"comment","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '{"mode":"strict","discovery_tools":[]}'::jsonb,'/input/comment_ids',TRUE),
    ('selected_media_review','媒体无障碍检查','检查手选媒体的 Alt 文本与复用质量。',NULL,'媒体无障碍检查',
     '{"type":"object","additionalProperties":false,"required":["media_ids"],"properties":{"media_ids":{"title":"媒体","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":30,"x-gouno-resource":"media_asset","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '{"mode":"strict","discovery_tools":[]}'::jsonb,'/input/media_ids',FALSE),
    ('selected_operations_deep_dive','运营建议深挖','补充手选运营建议的证据和优先级。',NULL,'运营建议深挖',
     '{"type":"object","additionalProperties":false,"required":["suggestion_ids"],"properties":{"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"minItems":1,"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}}}'::jsonb,
     '{"mode":"strict","discovery_tools":[]}'::jsonb,'/input/suggestion_ids',TRUE)
), created AS (
    INSERT INTO ai_workflows(name,description,enabled,template_key,timezone,current_version)
    SELECT name,description,FALSE,template_key,'Asia/Shanghai',1 FROM templates
    ON CONFLICT(template_key) DO NOTHING RETURNING id,template_key,current_version
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT c.id,c.current_version,t.input_schema,
    jsonb_build_array(jsonb_build_object('id','batch','type','for_each','collection_pointer',t.collection,'max_items',20,'steps',
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id','agent','type','model','agent_id',COALESCE(sa.id,ca.id),'include_context',TRUE)))))
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    t.scope_policy
FROM created c JOIN templates t USING(template_key)
LEFT JOIN ai_agents sa ON sa.system_key=t.agent_key AND sa.deleted_at IS NULL
LEFT JOIN ai_agents ca ON ca.name=t.agent_name AND ca.deleted_at IS NULL;

WITH templates(template_key,name,description,agent_name,input_schema) AS (
    VALUES
    ('selected_taxonomy_review','分类与标签整理','联合分析手选分类与标签的结构质量。','分类与标签整理',
     '{"type":"object","additionalProperties":false,"properties":{"category_ids":{"title":"分类","type":"array","items":{"type":"integer"},"maxItems":30,"x-gouno-resource":"category","x-gouno-widget":"entity-multi-select"},"tags":{"title":"标签","type":"array","items":{"type":"string"},"maxItems":30,"x-gouno-resource":"tag","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["category_ids"]},{"required":["tags"]}]}'::jsonb),
    ('selected_mixed_review','混合内容复盘','联合复盘手选文章、评论和运营建议。','混合内容复盘',
     '{"type":"object","additionalProperties":false,"properties":{"post_ids":{"title":"文章","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"post","x-gouno-widget":"entity-multi-select"},"comment_ids":{"title":"评论","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"comment","x-gouno-widget":"entity-multi-select"},"suggestion_ids":{"title":"运营建议","type":"array","items":{"type":"integer"},"maxItems":20,"x-gouno-resource":"operational_suggestion","x-gouno-widget":"entity-multi-select"}},"anyOf":[{"required":["post_ids"]},{"required":["comment_ids"]},{"required":["suggestion_ids"]}]}'::jsonb)
), created AS (
    INSERT INTO ai_workflows(name,description,enabled,template_key,timezone,current_version)
    SELECT name,description,FALSE,template_key,'Asia/Shanghai',1 FROM templates
    ON CONFLICT(template_key) DO NOTHING RETURNING id,template_key,current_version
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT c.id,c.current_version,t.input_schema,
    jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id),
        jsonb_build_object('id','result','type','output','output_pointer','/steps/agent')),
    '{"mode":"strict","discovery_tools":[]}'::jsonb
FROM created c JOIN templates t USING(template_key)
JOIN ai_agents a ON a.name=t.agent_name AND a.deleted_at IS NULL;

-- A deterministic scheduled example snapshots its targets before any model is
-- called. It is deliberately disabled until its bound Agent is reviewed.
WITH agent AS (SELECT id FROM ai_agents WHERE system_key='stale_content_refresh' AND deleted_at IS NULL LIMIT 1),
created AS (
    INSERT INTO ai_workflows(name,description,enabled,template_key,cron_expression,timezone,current_version)
    SELECT '陈旧文章规则审查','每周固定一批超过 180 天未更新的文章，再逐篇提出更新建议。',FALSE,'scheduled_stale_resource_review','0 9 * * 2','Asia/Shanghai',1
    ON CONFLICT(template_key) DO NOTHING RETURNING id,current_version
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT c.id,c.current_version,'{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id','select_posts','type','resource_query','resource_type','post','filter',jsonb_build_object('status','published','updated_before_days',180),'max_items',20),
      jsonb_build_object('id','batch','type','for_each','collection_pointer','/steps/select_posts','max_items',20,'steps',jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id,'include_context',TRUE))),
      jsonb_build_object('id','approval','type','approval_gate'),jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    '{"mode":"strict","discovery_tools":["content.search_knowledge"]}'::jsonb
FROM created c CROSS JOIN agent a;
