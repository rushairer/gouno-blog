# UI 重构任务卡索引（历史阶段任务卡）

> **已归档的计划索引（2026-11-12）**：下方“当前起点”和 U01–U08 前置关系记录项目早期状态，不能作为今日 `main` 上的可执行待办。请先检查 [实际的 UI 迁移证据及认证台账](../showcase-parity-certifications.json)、[历史计划](../PLAN.md)和 Gouno UI 主线。任务卡属于过程记录，不能因为“planned”字样就重复执行或宣称尚未开发。

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

**已清理无执行结果的过时占位任务卡（2026-11-12）**：U04c、U05a、U05b、U06a、U06b、U07a、U07b、U08a、U08b 的旧文件内容全部是 `planned` / `未执行` 模板，没有完成证明，且这些早期迁移阶段已被后续独立治理路线取代。原文件可通过 [迁移前的 Git 历史](https://github.com/rushairer/gouno-blog/tree/99a7d10e78a23511fd9edf7968e471537168a948/docs/ui-redesign/tasks) 回溯；**删除模板不代表任务已经通过验收或具体功能一定存在**。当前的缺陷必须从实际代码及最新认证台账重新确认后建立新的任务。

保留的卡片是当时的阶段性执行记录；其中的历史状态和结果不应覆盖现行认证台账。
