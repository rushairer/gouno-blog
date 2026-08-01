-- Development-only cleanup for the previous AI workspace prototypes. Provider
-- connections and all blog content remain intact; only AI workspace state is reset.
DELETE FROM ai_feedback;
DELETE FROM ai_content_candidates;
DELETE FROM ai_content_candidate_sets;
DELETE FROM ai_media_candidates;
DELETE FROM ai_editorial_tasks;
DELETE FROM ai_comment_reply_drafts;
DELETE FROM ai_operational_suggestions;
DELETE FROM ai_daily_news_sources;
DELETE FROM ai_daily_news_runs;
DELETE FROM ai_daily_news_jobs;
DELETE FROM ai_workflow_step_runs;
DELETE FROM ai_workflow_runs;
DELETE FROM ai_tool_calls;
DELETE FROM ai_usage_events;
DELETE FROM ai_approvals;
DELETE FROM ai_agent_runs;
DELETE FROM ai_workflow_versions;
DELETE FROM ai_workflows;
DELETE FROM ai_skill_versions;
DELETE FROM ai_agents;
DELETE FROM ai_skills;
DROP TABLE IF EXISTS ai_workspace_bootstrap;

ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS system_key VARCHAR(80);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS system_key VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_system_key ON ai_skills(system_key) WHERE system_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_system_key ON ai_agents(system_key) WHERE system_key IS NOT NULL;

CREATE TABLE ai_workspace_bootstrap (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    version INT NOT NULL,
    provider_profile_id BIGINT NOT NULL REFERENCES ai_provider_profiles(id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH seed(system_key, name, description, prompt, capabilities, execution_mode) AS (
    VALUES
    ('daily_news', 'AI 每日资讯', '汇总可信 AI 资讯并按 Agent 发布策略创建文章。', '仅使用 rss.fetch 返回的来源和事实。生成中文每日资讯后使用 data.json_parse 校验，并仅通过 content.create_post 创建内容。不要编造来源、日期或引文。', '["rss.fetch","data.json_parse","content.create_post"]'::jsonb, 'approval'),
    ('pre_publish_review', '发布前审校', '检查文章质量、链接、SEO 与知识库证据。', '对指定文章执行内容审校，使用授权的读取工具收集证据，输出具体、可核验的修改建议；需要改动时仅提出审批提案。', '["content.get_post","content.audit_post","content.check_links","content.search_knowledge","content.propose_update"]'::jsonb, 'approval'),
    ('stale_content_refresh', '陈旧内容更新', '识别陈旧文章并提出基于证据的更新建议。', '查找陈旧文章，结合文章内容和知识库证据生成更新建议。任何内容变更必须通过审批提案。', '["content.list_stale_posts","content.get_post","content.search_knowledge","content.propose_update"]'::jsonb, 'approval'),
    ('weekly_operations', '周度运营复盘', '汇总博客运营数据并输出本周复盘。', '读取运营和分析数据，输出本周表现、关键证据、风险与下一步建议。不要修改内容。', '["analytics.get_summary","analytics.list_low_engagement_posts"]'::jsonb, 'advisory'),
    ('comment_reply_draft', '评论回复草稿', '为待处理评论准备待审核回复。', '读取待处理评论，生成简洁、有帮助的回复草稿。仅通过评论回复提案提交，绝不直接发送。', '["comments.list_pending","comments.propose_reply"]'::jsonb, 'approval'),
    ('content_distribution', '内容分发草稿', '为文章准备社媒、邮件、FAQ 或图片 Brief。', '基于已有文章准备分发草稿，只能通过内容分发提案提交，不得向外部服务发送内容。', '["content.get_post","content.propose_distribution_draft"]'::jsonb, 'approval'),
    ('internal_linking', '站内链接优化', '发现相关文章并提出站内链接优化建议。', '分析指定文章和候选内部链接，给出有依据的链接建议；需要修改时仅提出审批提案。', '["content.get_post","content.find_internal_links","content.propose_update"]'::jsonb, 'approval'),
    ('low_engagement', '低互动文章分析', '识别低互动文章并输出优化建议。', '使用分析数据识别低互动文章，解释证据和优先级，输出可执行建议，不直接修改内容。', '["analytics.list_low_engagement_posts","content.get_post","content.audit_post"]'::jsonb, 'advisory')
), inserted AS (
    INSERT INTO ai_skills (system_key, name, description, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers)
    SELECT system_key, name, description, prompt, capabilities, execution_mode, 8, 24000, 4000, 10, 300000, '{"type":"object","additionalProperties":true}'::jsonb, '["manual","cron"]'::jsonb FROM seed
    RETURNING id, version, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers
)
INSERT INTO ai_skill_versions (skill_id, version, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers)
SELECT id, version, system_prompt, capabilities, execution_mode, max_steps, max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget, input_schema, allowed_triggers FROM inserted;

WITH templates(name, description, template_key, cron_expression, steps) AS (
    VALUES
    ('AI 每日资讯', '每天 09:00 调度 AI 每日资讯 Agent。', 'daily_news', '0 9 * * *', '[{"id":"agent","type":"model"},{"id":"result","type":"output","output_pointer":"/steps/agent"}]'::jsonb),
    ('周度运营复盘', '每周调度周度运营复盘 Agent。', 'weekly_operations', '0 9 * * 1', '[{"id":"agent","type":"model"},{"id":"result","type":"output","output_pointer":"/steps/agent"}]'::jsonb),
    ('陈旧内容更新', '定期调度陈旧内容更新 Agent。', 'stale_content_refresh', '0 9 * * 2', '[{"id":"agent","type":"model"},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/agent"}]'::jsonb),
    ('低互动文章分析', '定期调度低互动文章分析 Agent。', 'low_engagement', '0 9 * * 3', '[{"id":"agent","type":"model"},{"id":"result","type":"output","output_pointer":"/steps/agent"}]'::jsonb)
), workflows AS (
    INSERT INTO ai_workflows (name, description, enabled, template_key, cron_expression, timezone, current_version)
    SELECT name, description, FALSE, template_key, cron_expression, 'Asia/Shanghai', 1 FROM templates
    RETURNING id, template_key
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT w.id, 1, '{"type":"object","additionalProperties":false}'::jsonb, t.steps
FROM workflows w JOIN templates t USING (template_key);
