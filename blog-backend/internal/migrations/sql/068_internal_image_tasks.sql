ALTER TABLE ai_media_candidates ALTER COLUMN source_approval_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_media_candidates_direct_run
    ON ai_media_candidates(source_run_id)
    WHERE source_approval_id IS NULL;

DO $$
DECLARE
    skill_row ai_skills%ROWTYPE;
    new_skill_version_id BIGINT;
BEGIN
    UPDATE ai_skills
    SET version=version+1,
        description='为文章准备社媒、邮件、FAQ 草稿或站内图片任务。',
        system_prompt='基于已有文章准备内容分发草稿。输入 format=image_brief 时，必须使用 media.create_image_task 创建站内图片任务；该任务不会修改或发布文章。其他格式只能通过 content.propose_distribution_draft 提交审批提案，不得向外部服务发送内容。',
        capabilities='["content.get_post","content.propose_distribution_draft","media.create_image_task"]'::jsonb,
        updated_at=NOW()
    WHERE system_key='content_distribution' AND deleted_at IS NULL
    RETURNING * INTO skill_row;

    IF FOUND THEN
        INSERT INTO ai_skill_versions (
            skill_id,version,system_prompt,capabilities,tool_bindings,execution_mode,content_publish_mode,
            max_steps,max_input_tokens,max_output_tokens,default_daily_run_limit,default_monthly_token_budget,
            input_schema,allowed_triggers,created_by
        ) VALUES (
            skill_row.id,skill_row.version,skill_row.system_prompt,skill_row.capabilities,skill_row.tool_bindings,
            skill_row.execution_mode,skill_row.content_publish_mode,skill_row.max_steps,skill_row.max_input_tokens,
            skill_row.max_output_tokens,skill_row.default_daily_run_limit,skill_row.default_monthly_token_budget,
            skill_row.input_schema,skill_row.allowed_triggers,skill_row.created_by
        ) RETURNING id INTO new_skill_version_id;

        UPDATE ai_agents SET skill_version_id=new_skill_version_id,updated_at=NOW()
        WHERE system_key='content_distribution' AND deleted_at IS NULL;
    END IF;
END $$;

DO $$
DECLARE
    workflow_row RECORD;
    version_row RECORD;
    next_version INT;
    next_steps JSONB;
BEGIN
    SELECT w.id,w.current_version INTO workflow_row
    FROM ai_workflows w
    WHERE w.template_key='selected_article_image_generation' AND w.deleted_at IS NULL;

    IF FOUND THEN
        SELECT input_schema,steps,scope_policy,created_by INTO version_row
        FROM ai_workflow_versions
        WHERE workflow_id=workflow_row.id AND version=workflow_row.current_version;

        IF jsonb_path_exists(version_row.steps, '$[*] ? (@.type == "approval_gate")') THEN
            SELECT COALESCE(jsonb_agg(step ORDER BY ordinal), '[]'::jsonb) INTO next_steps
            FROM jsonb_array_elements(version_row.steps) WITH ORDINALITY AS value(step, ordinal)
            WHERE step->>'type' <> 'approval_gate';

            next_version := workflow_row.current_version + 1;
            UPDATE ai_workflows
            SET current_version=next_version,
                description='为手选文章创建内部图片任务；无需审批 Brief，生成后由你选择并应用到封面或正文。',
                updated_at=NOW()
            WHERE id=workflow_row.id;

            INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy,created_by)
            VALUES(workflow_row.id,next_version,version_row.input_schema,next_steps,version_row.scope_policy,version_row.created_by);
        END IF;
    END IF;
END $$;
