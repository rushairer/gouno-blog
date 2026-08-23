DO $$
DECLARE
    skill_row ai_skills%ROWTYPE;
    new_skill_version_id BIGINT;
BEGIN
    UPDATE ai_skills
    SET version = version + 1,
        system_prompt = '你是一个资深的 AI 科技媒体主编。请严格按照以下规则生成每日 AI 资讯精选：

1. 真实性与来源原则：
   - 仅使用 rss.fetch 返回的真实事实与来源，严禁编造任何事件、数据、日期或引文。
   - 从获取到的 RSS 资讯中，精选 6~8 条最具技术价值和行业影响力的重要动态。

2. 标题规范：
   - 文章标题 title 必须严格保持以下格式（不得在中英文间加空格，必须使用中文冒号）：
     每日AI资讯：YYYY年M月D日
     （例如：每日AI资讯：2026年8月21日）

3. 内容深度与排版结构（非常重要）：
   - 禁止添加“行业与市场”、“产品与功能”等大类分组标题。
   - 禁止在文章末尾单独生成“原文链接”列表或附录。
   - 采用「有序数字列表 + 粗体核心看点 + 深度摘要」的结构，每条资讯独立成段。
   - 每条资讯内容不得过于简短，需展开 2~3 句话（包括：核心事件、具体数据/技术背景、对行业或用户的影响）。
   - 每条资讯末尾紧跟该条目对应的原文 Markdown 链接。
   - 每条资讯的排版格式必须为：
     1. **[中文核心标题]**：[详细新闻内容展开，包含关键数据、背景原因及行业影响等 2~3 句话]。[查看原文](链接URL)

4. 发布流程：
   - 整理完成后，仅通过 content.create_post 工具创建文章，并在 summary 中生成一段精炼的今日看点导读。',
        updated_at = NOW()
    WHERE system_key = 'daily_news' AND deleted_at IS NULL
    RETURNING * INTO skill_row;

    IF FOUND THEN
        INSERT INTO ai_skill_versions (
            skill_id, version, system_prompt, capabilities, tool_bindings, execution_mode, content_publish_mode,
            max_steps, max_input_tokens, max_output_tokens, default_daily_run_limit, default_monthly_token_budget,
            input_schema, allowed_triggers, created_by
        ) VALUES (
            skill_row.id, skill_row.version, skill_row.system_prompt, skill_row.capabilities, skill_row.tool_bindings,
            skill_row.execution_mode, skill_row.content_publish_mode, skill_row.max_steps, skill_row.max_input_tokens,
            skill_row.max_output_tokens, skill_row.default_daily_run_limit, skill_row.default_monthly_token_budget,
            skill_row.input_schema, skill_row.allowed_triggers, skill_row.created_by
        ) RETURNING id INTO new_skill_version_id;

        UPDATE ai_agents
        SET skill_version_id = new_skill_version_id, updated_at = NOW()
        WHERE system_key = 'daily_news' AND deleted_at IS NULL;
    END IF;
END $$;
