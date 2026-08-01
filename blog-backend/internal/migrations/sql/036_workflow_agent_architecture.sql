-- Tools are Agent capabilities. Workflows only coordinate Agents and generic
-- control flow, preserving one execution model for every automation.
ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS content_publish_mode VARCHAR(20) NOT NULL DEFAULT 'approval';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agents_content_publish_mode_check') THEN
        ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_content_publish_mode_check
            CHECK (content_publish_mode IN ('draft', 'approval', 'publish'));
    END IF;
END $$;

WITH skill AS (
    INSERT INTO ai_skills (
        name, description, system_prompt, capabilities, execution_mode,
        max_steps, max_input_tokens, max_output_tokens, daily_run_limit,
        monthly_token_budget, input_schema, allowed_triggers
    ) VALUES (
        'AI Daily News',
        'Fetch allowlisted AI news feeds, verify the structured article payload, and create content according to the Agent publication policy.',
        'Produce a concise Chinese AI daily news post. First call rss.fetch with only the configured allowlisted feeds. Use only returned source facts and URLs; never invent facts, sources, dates, or quotations. Build a structured article payload with title, slug, summary, content, and tags. Validate that payload with data.json_parse, then call content.create_post exactly once. The Agent publication policy controls whether this becomes a draft, approval request, or published post.',
        '["rss.fetch","data.json_parse","content.create_post"]'::jsonb,
        'approval', 8, 24000, 4000, 2, 300000,
        '{"type":"object","additionalProperties":false}'::jsonb,
        '["manual","cron"]'::jsonb
    ) ON CONFLICT (name) DO UPDATE SET
        description=EXCLUDED.description, system_prompt=EXCLUDED.system_prompt,
        capabilities=EXCLUDED.capabilities, execution_mode=EXCLUDED.execution_mode,
        max_steps=EXCLUDED.max_steps, max_input_tokens=EXCLUDED.max_input_tokens,
        max_output_tokens=EXCLUDED.max_output_tokens, daily_run_limit=EXCLUDED.daily_run_limit,
        monthly_token_budget=EXCLUDED.monthly_token_budget, input_schema=EXCLUDED.input_schema,
        allowed_triggers=EXCLUDED.allowed_triggers, version=ai_skills.version+1,
        updated_at=NOW(), deleted_at=NULL
    RETURNING id, version, system_prompt, capabilities, execution_mode, max_steps,
        max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget,
        input_schema, allowed_triggers, created_by
)
INSERT INTO ai_skill_versions (
    skill_id, version, system_prompt, capabilities, execution_mode, max_steps,
    max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget,
    input_schema, allowed_triggers, created_by
)
SELECT id, version, system_prompt, capabilities, execution_mode, max_steps,
    max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget,
    input_schema, allowed_triggers, created_by FROM skill
ON CONFLICT (skill_id, version) DO NOTHING;

WITH templates(template_key, input_schema, steps) AS (
    VALUES
    ('pre_publish_review',
     '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer","minimum":1}}}'::jsonb,
     '[{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/editor"}]'::jsonb),
    ('weekly_operations',
     '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer","minimum":1}}}'::jsonb,
     '[{"id":"report","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"result","type":"output","output_pointer":"/steps/report"}]'::jsonb),
    ('stale_content_refresh',
     '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer","minimum":1}}}'::jsonb,
     '[{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/editor"}]'::jsonb)
), bumped AS (
    UPDATE ai_workflows w SET current_version=w.current_version+1, enabled=FALSE,
        next_run_at=NULL, updated_at=NOW()
    FROM templates t WHERE w.template_key=t.template_key
    RETURNING w.id, w.template_key, w.current_version
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT b.id, b.current_version, t.input_schema, t.steps
FROM bumped b JOIN templates t ON t.template_key=b.template_key;

WITH workflow AS (
    INSERT INTO ai_workflows (name, description, enabled, cron_expression, timezone, next_run_at, template_key)
    VALUES ('AI 每日资讯', '普通 Workflow 模板：每天 09:00 调度已配置的 AI 每日资讯 Agent。', FALSE, '0 9 * * *', 'Asia/Shanghai', NULL, 'ai_daily_news')
    ON CONFLICT (template_key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
        enabled=FALSE, cron_expression=EXCLUDED.cron_expression, timezone=EXCLUDED.timezone,
        next_run_at=NULL, current_version=ai_workflows.current_version+1, updated_at=NOW()
    RETURNING id, current_version
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT id, current_version,
    '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer","minimum":1}}}'::jsonb,
    '[{"id":"daily_news_writer","name":"生成 AI 每日资讯","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"result","name":"输出结果","type":"output","output_pointer":"/steps/daily_news_writer"}]'::jsonb
FROM workflow
ON CONFLICT (workflow_id, version) DO UPDATE SET input_schema=EXCLUDED.input_schema, steps=EXCLUDED.steps;

-- Earlier hand-off placeholders remain as audit history only and are not
-- displayed or scheduled as a second daily-news automation.
UPDATE ai_workflows SET enabled=FALSE, next_run_at=NULL, deleted_at=COALESCE(deleted_at, NOW()), updated_at=NOW()
WHERE name='AI 每日资讯（筹备）';

-- Preserve custom legacy definitions for audit, but never schedule a version
-- that still contains a direct Tool step.
UPDATE ai_workflows w SET enabled=FALSE, next_run_at=NULL, updated_at=NOW()
FROM ai_workflow_versions v
WHERE v.workflow_id=w.id AND v.version=w.current_version
  AND v.steps @> '[{"type":"tool"}]'::jsonb;
