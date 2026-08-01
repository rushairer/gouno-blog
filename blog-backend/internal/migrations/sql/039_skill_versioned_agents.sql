-- Skills own behavior. Agents are deployment instances that pin one immutable
-- Skill Version and retain only runtime configuration and tighter limits.

ALTER TABLE ai_skills
    ADD COLUMN IF NOT EXISTS content_publish_mode VARCHAR(20) NOT NULL DEFAULT 'approval',
    ADD COLUMN IF NOT EXISTS default_daily_run_limit INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS default_monthly_token_budget BIGINT NOT NULL DEFAULT 1000000;
ALTER TABLE ai_skill_versions
    ADD COLUMN IF NOT EXISTS content_publish_mode VARCHAR(20) NOT NULL DEFAULT 'approval',
    ADD COLUMN IF NOT EXISTS default_daily_run_limit INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS default_monthly_token_budget BIGINT NOT NULL DEFAULT 1000000;

UPDATE ai_skills SET
    default_daily_run_limit=daily_run_limit,
    default_monthly_token_budget=monthly_token_budget
WHERE default_daily_run_limit=10 AND default_monthly_token_budget=1000000;
UPDATE ai_skill_versions SET
    default_daily_run_limit=daily_run_limit,
    default_monthly_token_budget=monthly_token_budget
WHERE default_daily_run_limit=10 AND default_monthly_token_budget=1000000;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_skills_content_publish_mode_check') THEN
        ALTER TABLE ai_skills ADD CONSTRAINT ai_skills_content_publish_mode_check
            CHECK (content_publish_mode IN ('draft','approval','publish'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_skill_versions_content_publish_mode_check') THEN
        ALTER TABLE ai_skill_versions ADD CONSTRAINT ai_skill_versions_content_publish_mode_check
            CHECK (content_publish_mode IN ('draft','approval','publish'));
    END IF;
END $$;

ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS max_steps_override INT,
    ADD COLUMN IF NOT EXISTS max_input_tokens_override INT,
    ADD COLUMN IF NOT EXISTS max_output_tokens_override INT;

-- Keep an exact, immutable behavior snapshot whenever the old Agent cannot
-- safely inherit its referenced Skill Version. This protects custom and legacy
-- Agent behavior before duplicate columns are removed.
DO $$
DECLARE
    rec RECORD;
    migrated_skill_id BIGINT;
    migrated_version_id BIGINT;
BEGIN
    FOR rec IN
        SELECT a.*
        FROM ai_agents a
        LEFT JOIN ai_skill_versions sv ON sv.id=a.skill_version_id
        WHERE a.skill_version_id IS NULL
           OR sv.id IS NULL
           OR a.system_prompt IS DISTINCT FROM sv.system_prompt
           OR a.capabilities IS DISTINCT FROM sv.capabilities
           OR a.execution_mode IS DISTINCT FROM sv.execution_mode
           OR a.content_publish_mode IS DISTINCT FROM sv.content_publish_mode
           OR a.max_steps > sv.max_steps
           OR a.max_input_tokens > sv.max_input_tokens
           OR a.max_output_tokens > sv.max_output_tokens
    LOOP
        INSERT INTO ai_skills (
            name, description, system_prompt, capabilities, execution_mode,
            max_steps, max_input_tokens, max_output_tokens,
            default_daily_run_limit, default_monthly_token_budget,
            input_schema, allowed_triggers, content_publish_mode, created_by
        ) VALUES (
            'Migrated Agent Skill #' || rec.id, rec.description, rec.system_prompt,
            rec.capabilities, rec.execution_mode, rec.max_steps, rec.max_input_tokens,
            rec.max_output_tokens, rec.daily_run_limit, rec.monthly_token_budget,
            '{"type":"object","additionalProperties":true}'::jsonb,
            CASE WHEN rec.trigger_type='cron' THEN '["manual","cron"]'::jsonb ELSE '["manual"]'::jsonb END,
            rec.content_publish_mode, rec.created_by
        ) RETURNING id INTO migrated_skill_id;

        INSERT INTO ai_skill_versions (
            skill_id, version, system_prompt, capabilities, execution_mode,
            max_steps, max_input_tokens, max_output_tokens,
            default_daily_run_limit, default_monthly_token_budget,
            input_schema, allowed_triggers, content_publish_mode, created_by
        ) VALUES (
            migrated_skill_id, 1, rec.system_prompt, rec.capabilities, rec.execution_mode,
            rec.max_steps, rec.max_input_tokens, rec.max_output_tokens,
            rec.daily_run_limit, rec.monthly_token_budget,
            '{"type":"object","additionalProperties":true}'::jsonb,
            CASE WHEN rec.trigger_type='cron' THEN '["manual","cron"]'::jsonb ELSE '["manual"]'::jsonb END,
            rec.content_publish_mode, rec.created_by
        ) RETURNING id INTO migrated_version_id;

        UPDATE ai_agents SET skill_version_id=migrated_version_id WHERE id=rec.id;
    END LOOP;
END $$;

-- A linked version is authoritative. Only preserve old lower per-run limits as
-- explicit Agent overrides; higher values were snapshotted above.
UPDATE ai_agents a SET
    max_steps_override=CASE WHEN a.max_steps < sv.max_steps THEN a.max_steps ELSE NULL END,
    max_input_tokens_override=CASE WHEN a.max_input_tokens < sv.max_input_tokens THEN a.max_input_tokens ELSE NULL END,
    max_output_tokens_override=CASE WHEN a.max_output_tokens < sv.max_output_tokens THEN a.max_output_tokens ELSE NULL END
FROM ai_skill_versions sv WHERE sv.id=a.skill_version_id;

-- Every legacy Run gets a stable version association. Existing associations are
-- immutable audit facts and are never rewritten.
UPDATE ai_agent_runs r SET skill_version_id=a.skill_version_id
FROM ai_agents a
WHERE r.agent_id=a.id AND r.skill_version_id IS NULL;

ALTER TABLE ai_agent_runs DROP CONSTRAINT IF EXISTS ai_agent_runs_skill_version_id_fkey;
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_skill_version_id_fkey;
ALTER TABLE ai_agents ALTER COLUMN skill_version_id SET NOT NULL;
ALTER TABLE ai_agent_runs ALTER COLUMN skill_version_id SET NOT NULL;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_skill_version_id_fkey
    FOREIGN KEY (skill_version_id) REFERENCES ai_skill_versions(id) ON DELETE RESTRICT;
ALTER TABLE ai_agent_runs ADD CONSTRAINT ai_agent_runs_skill_version_id_fkey
    FOREIGN KEY (skill_version_id) REFERENCES ai_skill_versions(id) ON DELETE RESTRICT;

ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agent_limits_check;
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agent_mode_check;
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_content_publish_mode_check;
ALTER TABLE ai_agents DROP COLUMN system_prompt,
    DROP COLUMN capabilities,
    DROP COLUMN execution_mode,
    DROP COLUMN content_publish_mode,
    DROP COLUMN max_steps,
    DROP COLUMN max_input_tokens,
    DROP COLUMN max_output_tokens;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agent_runtime_limits_check CHECK (
    daily_run_limit > 0 AND monthly_token_budget > 0
    AND (max_steps_override IS NULL OR max_steps_override BETWEEN 1 AND 20)
    AND (max_input_tokens_override IS NULL OR max_input_tokens_override > 0)
    AND (max_output_tokens_override IS NULL OR max_output_tokens_override > 0)
);

ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skill_limits_check;
ALTER TABLE ai_skills DROP COLUMN daily_run_limit, DROP COLUMN monthly_token_budget;
ALTER TABLE ai_skills ADD CONSTRAINT ai_skill_limits_check CHECK (
    max_steps BETWEEN 1 AND 20 AND max_input_tokens > 0 AND max_output_tokens > 0
    AND default_daily_run_limit > 0 AND default_monthly_token_budget > 0 AND version > 0
);
ALTER TABLE ai_skill_versions DROP COLUMN daily_run_limit, DROP COLUMN monthly_token_budget;

-- Default workflows remain disabled and only coordinate their bound Agent.
WITH templates(template_key, name, description, cron_expression, needs_gate) AS (
    VALUES
    ('daily_news', 'AI 每日资讯', '每天 09:00 调度 AI 每日资讯 Agent。', '0 9 * * *', FALSE),
    ('weekly_operations', '周度运营复盘', '每周调度周度运营复盘 Agent。', '0 9 * * 1', FALSE),
    ('stale_content_refresh', '陈旧内容更新', '定期调度陈旧内容更新 Agent。', '0 9 * * 2', TRUE),
    ('low_engagement', '低互动文章分析', '定期调度低互动文章分析 Agent。', '0 9 * * 3', FALSE)
), updated AS (
    UPDATE ai_workflows w SET name=t.name, description=t.description, enabled=FALSE,
        cron_expression=t.cron_expression, timezone='Asia/Shanghai', next_run_at=NULL,
        current_version=w.current_version+1, updated_at=NOW()
    FROM templates t WHERE w.template_key=t.template_key AND w.deleted_at IS NULL
    RETURNING w.id, w.template_key, w.current_version
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT u.id, u.current_version, '{"type":"object","additionalProperties":false}'::jsonb,
    jsonb_build_array(jsonb_build_object('id','agent','type','model','agent_id',a.id))
    || CASE WHEN t.needs_gate THEN jsonb_build_array(jsonb_build_object('id','approval','type','approval_gate')) ELSE '[]'::jsonb END
    || jsonb_build_array(jsonb_build_object('id','result','type','output','output_pointer','/steps/agent'))
FROM updated u JOIN templates t USING (template_key)
JOIN ai_agents a ON a.system_key=u.template_key AND a.deleted_at IS NULL;

UPDATE ai_agents SET enabled=FALSE WHERE system_key IS NOT NULL AND deleted_at IS NULL;
