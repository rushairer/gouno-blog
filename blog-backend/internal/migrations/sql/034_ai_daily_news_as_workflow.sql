UPDATE ai_workflows
SET description = '普通 Workflow 模板：每日 09:00（Asia/Shanghai）汇总受限 RSS，使用默认写作模型生成并发布 AI 每日资讯。',
    enabled = FALSE,
    updated_at = NOW()
WHERE name = 'AI 每日资讯（筹备）';
