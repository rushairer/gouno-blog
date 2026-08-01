-- Preserve historical migrations and audit tables. This migration only repairs
-- the current control plane after Agent/Skill convergence.

WITH seed(system_key, name, description, system_prompt, capabilities, execution_mode, content_publish_mode) AS (
    VALUES
    ('daily_news', 'AI 每日资讯', '汇总可信 AI 资讯并按 Skill 发布策略创建文章。', '仅使用 rss.fetch 返回的来源和事实。生成中文每日资讯后使用 data.json_parse 校验，并仅通过 content.create_post 创建内容。不要编造来源、日期或引文。', '["rss.fetch","data.json_parse","content.create_post"]'::jsonb, 'approval', 'approval'),
    ('pre_publish_review', '发布前审校', '检查文章质量、链接、SEO 与知识库证据。', '对指定文章执行内容审校，使用授权的读取工具收集证据，输出具体、可核验的修改建议；需要改动时仅提出审批提案。', '["content.get_post","content.audit_post","content.check_links","content.search_knowledge","content.propose_update"]'::jsonb, 'approval', 'approval'),
    ('stale_content_refresh', '陈旧内容更新', '识别陈旧文章并提出基于证据的更新建议。', '查找陈旧文章，结合文章内容和知识库证据生成更新建议。任何内容变更必须通过审批提案。', '["content.list_stale_posts","content.get_post","content.search_knowledge","content.propose_update"]'::jsonb, 'approval', 'approval'),
    ('weekly_operations', '周度运营复盘', '汇总博客运营数据并输出本周复盘。', '读取运营和分析数据，输出本周表现、关键证据、风险与下一步建议。不要修改内容。', '["analytics.get_summary","analytics.list_low_engagement_posts"]'::jsonb, 'advisory', 'approval'),
    ('comment_reply_draft', '评论回复草稿', '为待处理评论准备待审核回复。', '读取待处理评论，生成简洁、有帮助的回复草稿。仅通过评论回复提案提交，绝不直接发送。', '["comments.list_pending","comments.propose_reply"]'::jsonb, 'approval', 'approval'),
    ('content_distribution', '内容分发草稿', '为文章准备社媒、邮件、FAQ 或图片 Brief。', '基于已有文章准备分发草稿，只能通过内容分发提案提交，不得向外部服务发送内容。', '["content.get_post","content.propose_distribution_draft"]'::jsonb, 'approval', 'approval'),
    ('internal_linking', '站内链接优化', '发现相关文章并提出站内链接优化建议。', '分析指定文章和候选内部链接，给出有依据的链接建议；需要修改时仅提出审批提案。', '["content.get_post","content.find_internal_links","content.propose_update"]'::jsonb, 'approval', 'approval'),
    ('low_engagement', '低互动文章分析', '识别低互动文章并输出优化建议。', '使用分析数据识别低互动文章，解释证据和优先级，输出可执行建议，不直接修改内容。', '["analytics.list_low_engagement_posts","content.get_post","content.audit_post"]'::jsonb, 'advisory', 'approval')
)
INSERT INTO ai_skills (system_key, name, description, system_prompt, capabilities, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers)
SELECT system_key, name, description, system_prompt, capabilities, execution_mode, content_publish_mode,
    8, 24000, 4000, 10, 300000, '{"type":"object","additionalProperties":true}'::jsonb, '["manual","cron"]'::jsonb
FROM seed
ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING;

-- A partially applied historical seed can have a Skill without its current
-- immutable Version. Reconstruct that Version from the Skill's own behavior.
INSERT INTO ai_skill_versions (skill_id, version, system_prompt, capabilities, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, created_by)
SELECT s.id, s.version, s.system_prompt, s.capabilities, s.execution_mode, s.content_publish_mode,
    s.max_steps, s.max_input_tokens, s.max_output_tokens, s.default_daily_run_limit, s.default_monthly_token_budget,
    s.input_schema, s.allowed_triggers, s.created_by
FROM ai_skills s
WHERE s.system_key IS NOT NULL AND s.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM ai_skill_versions sv WHERE sv.skill_id=s.id AND sv.version=s.version)
ON CONFLICT (skill_id, version) DO NOTHING;

WITH templates(template_key, name, description, cron_expression, needs_gate) AS (
    VALUES
    ('daily_news', 'AI 每日资讯', '每天 09:00 调度 AI 每日资讯 Agent。', '0 9 * * *', FALSE),
    ('weekly_operations', '周度运营复盘', '每周调度周度运营复盘 Agent。', '0 9 * * 1', FALSE),
    ('stale_content_refresh', '陈旧内容更新', '定期调度陈旧内容更新 Agent。', '0 9 * * 2', TRUE),
    ('low_engagement', '低互动文章分析', '定期调度低互动文章分析 Agent。', '0 9 * * 3', FALSE)
), inserted AS (
INSERT INTO ai_workflows (name, description, enabled, template_key, cron_expression, timezone, next_run_at)
    SELECT CASE WHEN EXISTS (
                SELECT 1 FROM ai_workflows existing
                WHERE existing.name=t.name AND existing.deleted_at IS NULL
            ) THEN t.name || ' [' || t.template_key || ']'
            ELSE t.name END,
        description, FALSE, template_key, cron_expression, 'Asia/Shanghai', NULL
    FROM templates t
    WHERE NOT EXISTS (SELECT 1 FROM ai_workflows w WHERE w.template_key=t.template_key AND w.deleted_at IS NULL)
    RETURNING id, template_key, current_version
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT i.id, i.current_version, '{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(jsonb_build_object('id','agent','type','model'))
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/agent'))
FROM inserted i JOIN templates t USING (template_key);

-- Dynamic Agent references are legacy definitions. Preserve their Version for
-- audit, but never let it be scheduled or executed again.
UPDATE ai_workflows w SET enabled=FALSE, next_run_at=NULL, updated_at=NOW()
FROM ai_workflow_versions v
WHERE v.workflow_id=w.id AND v.version=w.current_version
  AND v.steps::text LIKE '%agent_id_pointer%';
