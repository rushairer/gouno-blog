UPDATE ai_workflows
SET description = '历史 AI 每日资讯模板，保留审计记录且不再执行。',
    enabled = FALSE,
    updated_at = NOW()
WHERE name = 'AI 每日资讯（筹备）';
