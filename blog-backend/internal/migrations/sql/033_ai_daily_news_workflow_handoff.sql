UPDATE ai_workflows
SET description = '此筹备 Workflow 已由专用“AI 每日资讯”自动化接管。专用任务负责受限 RSS、每日 09:00（Asia/Shanghai）调度和自动发布；本 Workflow 保持停用，不能用于自动发布。',
    enabled = FALSE,
    updated_at = NOW()
WHERE name = 'AI 每日资讯（筹备）';
