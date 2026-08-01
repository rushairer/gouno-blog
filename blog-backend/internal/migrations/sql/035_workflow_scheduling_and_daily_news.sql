ALTER TABLE ai_workflows
    ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(80),
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
    ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

ALTER TABLE ai_workflow_runs ADD COLUMN IF NOT EXISTS schedule_key VARCHAR(160);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_workflow_runs_schedule_key
    ON ai_workflow_runs(workflow_id, schedule_key) WHERE schedule_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_workflows_due
    ON ai_workflows(enabled, next_run_at) WHERE enabled = TRUE AND deleted_at IS NULL;

UPDATE ai_workflows
SET name = 'AI 每日资讯',
    description = '普通 Workflow：抓取受限 RSS，使用默认写作模型生成固定格式文章并发布。',
    template_key = 'ai_daily_news',
    cron_expression = '0 9 * * *',
    timezone = 'Asia/Shanghai',
    next_run_at = NULL,
    enabled = FALSE,
    updated_at = NOW()
WHERE name = 'AI 每日资讯（筹备）';

UPDATE ai_workflow_versions v
SET input_schema = '{"type":"object","additionalProperties":false}'::jsonb,
    steps = '[{"id":"publish_daily_news","name":"抓取、生成并发布每日资讯","type":"rss_daily_post"},{"id":"result","name":"输出发布结果","type":"output","output_pointer":"/steps/publish_daily_news"}]'::jsonb
FROM ai_workflows w
WHERE v.workflow_id = w.id AND v.version = w.current_version AND w.template_key = 'ai_daily_news';
