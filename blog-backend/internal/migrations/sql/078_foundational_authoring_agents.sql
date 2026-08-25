-- Foundational, deliberately disabled Agents. They provide neutral authoring
-- capabilities so a planner does not have to repurpose a domain-specific
-- news or distribution Agent for a general writing request.
WITH seed(system_key, name, description, prompt, capabilities, execution_mode, publish_mode, max_output_tokens) AS (
    VALUES
      ('article_draft_writer', '通用文章草稿', '根据主题撰写待审核的技术或知识类文章草稿；不依赖新闻源。',
       '根据用户提供的主题、目标读者和约束，撰写准确、结构清晰的中文文章草稿。需要事实时明确不确定性，不能编造来源、数据或引用。可包含简洁的示例代码，但不得声称已运行。仅调用 content.propose_draft 创建待审核草稿，绝不发布或修改既有内容。',
       '["content.propose_draft"]'::jsonb, 'approval', 'approval', 5000),
      ('image_task_creator', '通用图片任务', '把文章或创意 Brief 转为站内图片生成任务；不修改文章。',
       '根据输入的文章主题或创意 Brief，构思清晰、可执行的封面或配图任务。只调用 media.create_image_task 创建站内图片任务；不选择、应用、发布或删除任何媒体。',
       '["media.create_image_task"]'::jsonb, 'approval', 'approval', 1800)
)
INSERT INTO ai_skills(system_key, name, description, system_prompt, capabilities, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers)
SELECT system_key, name, description, prompt, capabilities, execution_mode, publish_mode,
    6, 16000, max_output_tokens, 10, 300000, '{"type":"object","additionalProperties":true}'::jsonb, '["manual","cron"]'::jsonb
FROM seed
ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING;

INSERT INTO ai_skill_versions(skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
    max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget, input_schema, allowed_triggers, created_by)
SELECT s.id, s.version, s.system_prompt, s.capabilities, s.tool_bindings, s.execution_mode, s.content_publish_mode,
    s.max_steps, s.max_input_tokens, s.max_output_tokens, s.default_daily_run_limit, s.default_monthly_token_budget, s.input_schema, s.allowed_triggers, s.created_by
FROM ai_skills s
WHERE s.system_key IN ('article_draft_writer', 'image_task_creator') AND s.deleted_at IS NULL
ON CONFLICT (skill_id, version) DO NOTHING;

WITH skills AS (
  SELECT s.system_key, s.name, s.description, s.default_daily_run_limit, s.default_monthly_token_budget, sv.id AS version_id
  FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
  WHERE s.system_key IN ('article_draft_writer', 'image_task_creator') AND s.deleted_at IS NULL
)
INSERT INTO ai_agents(system_key, name, description, skill_version_id, enabled, trigger_type, timezone, daily_run_limit, monthly_token_budget)
SELECT system_key, name, description, version_id, FALSE, 'manual', 'Asia/Shanghai', default_daily_run_limit, default_monthly_token_budget
FROM skills
ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING;
