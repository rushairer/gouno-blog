WITH templates(template_key,name,description,agent_name,cron_expression) AS (
    VALUES
    ('scheduled_post_publish_review','发布后内容复盘','每天复盘最近两天发布的文章，生成需要人工确认的质量改进建议。','发布前审校','15 10 * * *'),
    ('scheduled_reported_comment_review','被举报评论复盘','每天汇总被举报评论并生成待审批的回复或处理建议。','评论回复草稿','30 10 * * *'),
    ('scheduled_missing_alt_review','缺失 Alt 媒体检查','每周检查缺失 Alt 文本的媒体并生成无障碍改进建议。','媒体无障碍检查','0 11 * * 3')
), eligible AS (
    SELECT t.* FROM templates t
    JOIN ai_agents a ON a.name=t.agent_name AND a.deleted_at IS NULL
)
INSERT INTO ai_workflows(name,description,enabled,template_key,cron_expression,timezone,current_version,resource_query_empty_policy)
SELECT name,description,FALSE,template_key,cron_expression,'Asia/Shanghai',1,'succeed'
FROM eligible
ON CONFLICT(template_key) DO NOTHING;

WITH templates(template_key,agent_name,resource_type,filter,max_items,needs_gate) AS (
    VALUES
    ('scheduled_post_publish_review','发布前审校','post','{"status":"published","published_within_days":2}'::jsonb,20,TRUE),
    ('scheduled_reported_comment_review','评论回复草稿','comment','{"reported":true}'::jsonb,30,TRUE),
    ('scheduled_missing_alt_review','媒体无障碍检查','media_asset','{"missing_alt":true}'::jsonb,30,FALSE)
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy)
SELECT w.id,w.current_version,
    '{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(
        jsonb_build_object('id','select_resources','type','resource_query','resource_type',t.resource_type,'filter',t.filter,'max_items',t.max_items),
        jsonb_build_object('id','batch','type','for_each','collection_pointer','/steps/select_resources','max_items',t.max_items,'steps',
            jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id,'include_context',TRUE)))
    )
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/batch')),
    '{"mode":"strict","discovery_tools":[]}'::jsonb
FROM templates t
JOIN ai_workflows w ON w.template_key=t.template_key
JOIN ai_agents a ON a.name=t.agent_name AND a.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM ai_workflow_versions v WHERE v.workflow_id=w.id AND v.version=w.current_version)
ON CONFLICT(workflow_id,version) DO NOTHING;
