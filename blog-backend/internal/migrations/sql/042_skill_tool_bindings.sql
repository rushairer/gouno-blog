-- Tool invocation configuration is Skill-owned behavior. It is versioned with
-- the Skill, never stored on an Agent or exposed to Workflow definitions.
ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS tool_bindings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_skill_versions ADD COLUMN IF NOT EXISTS tool_bindings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Repair the system daily-news Skill with an immutable version that has
-- explicit, allowlisted sources. Only the platform-managed Agent is upgraded;
-- user Agents retain their intentionally pinned Skill Versions.
WITH updated AS (
    UPDATE ai_skills
    SET tool_bindings = '{
        "rss.fetch": {
            "feeds": [
                {"name":"OpenAI News","url":"https://openai.com/news/rss.xml"},
                {"name":"Google Blog","url":"https://blog.google/rss/"},
                {"name":"TechCrunch AI","url":"https://techcrunch.com/category/artificial-intelligence/feed/"}
            ],
            "max_per_feed": 8,
            "max_items": 20
        }
    }'::jsonb,
        version = version + 1,
        updated_at = NOW()
    WHERE system_key = 'daily_news' AND deleted_at IS NULL
      AND tool_bindings = '{}'::jsonb
    RETURNING id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
        max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit,
        default_monthly_token_budget, input_schema, allowed_triggers, created_by
), versioned AS (
    INSERT INTO ai_skill_versions (
        skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
        max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit,
        default_monthly_token_budget, input_schema, allowed_triggers, created_by
    )
    SELECT id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
        max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit,
        default_monthly_token_budget, input_schema, allowed_triggers, created_by
    FROM updated
    ON CONFLICT (skill_id, version) DO NOTHING
    RETURNING skill_id, id
)
UPDATE ai_agents a
SET skill_version_id = v.id, updated_at = NOW()
FROM versioned v
JOIN ai_skills s ON s.id = v.skill_id
WHERE a.system_key = 'daily_news' AND a.deleted_at IS NULL AND s.system_key = 'daily_news';
