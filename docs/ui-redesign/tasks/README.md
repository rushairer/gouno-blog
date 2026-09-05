# UI 重构任务卡索引

这些任务卡采用 `docs/quality/tasks` 的格式。每张卡都可以在一个新会话中独立执行。执行顺序按前置关系推进，不要把多个未解锁任务合并到一个会话。

## 当前起点

阶段 0 已完成盘点，清单保持 111 条 `not-started` / `not-run`。下一步先处理 U01a、U01b，再执行 U01c 和 U01d。页面视觉迁移从 U02a 开始。

## 任务卡

| 卡片 | 范围 | 前置 |
| --- | --- | --- |
| [U01a](U01a-blog-coverage.md) | Blog coverage 阻断 | 阶段 0 |
| [U01b](U01b-gosso-test-url.md) | gosso-admin 测试 URL 契约 | 阶段 0 |
| [U01c](U01c-shared-ui-validation.md) | 共享包安装、主题和 showcase | U01a、U01b |
| [U01d](U01d-shared-ui-review.md) | 共享包独立复核 | U01c |
| [U02a](U02a-blog-discovery.md) | Blog Shell 与发现页 | U01d |
| [U02b](U02b-blog-reading.md) | Blog 阅读与公共状态 | U02a |
| [U02c](U02c-blog-public-review.md) | Blog 公共阶段复核 | U02b |
| [U03a](U03a-blog-admin-shell.md) | Admin Shell、Dashboard、列表 | U02c |
| [U03b](U03b-blog-editors.md) | Posts/Pages 编辑器 | U03a |
| [U03c](U03c-blog-admin-support.md) | Taxonomy、评论、媒体、设置 | U03a |
| [U03d](U03d-blog-admin-review.md) | Blog Admin 阶段复核 | U03b、U03c |
| [U04a](U04a-ai-workspace.md) | AI 工作台 | U03d |
| [U04b](U04b-connector-display.md) | Connector 展示层 | U04a |
| [U04c](U04c-ai-connector-review.md) | AI/Connector 阶段复核 | U04a、U04b |
| [U05a](U05a-gosso-auth-account.md) | gosso-admin 认证与账户 | U01d |
| [U05b](U05b-gosso-auth-review.md) | 认证阶段复核 | U05a |
| [U06a](U06a-gosso-management.md) | gosso-admin 系统管理 | U05b |
| [U06b](U06b-gosso-management-review.md) | 管理阶段复核 | U06a |
| [U07a](U07a-distribution-build.md) | 分发、构建、Docker | U04c、U06b |
| [U07b](U07b-integration-review.md) | 集成阶段复核 | U07a |
| [U08a](U08a-browser-accessibility.md) | 浏览器、响应式、无障碍 QA | U07b |
| [U08b](U08b-final-cleanup.md) | 清理、证据和最终验收 | U08a |

每张卡都要求先核对当前基线；任务卡的 `结果` 段落由执行会话填写，不由计划编制者预先宣称完成。
