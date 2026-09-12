# U04a：AI 工作台

状态：implemented-ci-verified。前置：U03d（正式独立复核仍为 review-pending；本轮实现已提前进入主线）。

## 目标与范围

迁移 `/admin/ai-ops` overview、inbox、automation、records、advanced，以及 Agent、Workflow、Run、Approval、Preview、输入/工具/Provider/Embedding/Skill/Knowledge 子视图。保留 `tab`、`record`、`run`、`workflow` 参数语义。

## 验收

- [x] 运行详情、审批、预览、失败、禁用和空数据状态由当前组件/自动化回归覆盖。
- [x] 工作流编辑、版本和输入/工具配置未改变保存/API 语义；native `alert/confirm/prompt` 已从产品源码清零并由 AST 门禁阻止回流。
- [ ] 大量记录、长输出和移动端宽内容仍需 U04c/最终 Browser QA 的独立渲染证据。
- [x] 相关 API、权限、typecheck、coverage、production build 与 Docker image 门禁无回归。

## 结果

- 当前复核基线：2026-09-13 `main` `6f722dcdd34f3495a293d7a77dff4baf35e1120a`；Blog `@gouno/ui` provenance 与 `gouno-ui/main` 同为 `cb946376e32bcc0db18d13fb09d89d71b5780dca`。
- Advanced Settings：Agents、Skills、Tools、Providers、Knowledge 已使用 canonical Card/Alert/Tag/Button/Select 等组合；早期 `agent-table-panel`、`provider-identity`、`secret-mask`、`agent-state`、`knowledge-workspace` 等运行时结构已退出。
- Operations / Workflow：native confirm/prompt 已替换为受控 Modal/Form；退休的 overview/approval/operations/editorial/Agent/Workflow shell CSS 已分批删除并加入防回流门禁。Workflow 对 generic `.btn` 的 CSS 覆盖已经归零。
- CSS 边界：`agent-console.css` 中 generic `.btn` 仅剩 `agent-row-actions .btn` 一个显式白名单；该规则仍与 ConnectorWorkspace 共享，因此在 Connector Module Hold 解除前不越界修改。canonical `[data-slot]` 与 primitive ownership 由 `lint:ui` 强制属于 `@gouno/ui`。
- 自动化证据：PR #181–#186 的最终 clean heads 持续通过 Frontend quality；#186 的 CI 与 Images 全绿。没有以降低 coverage、删除测试或放宽 contract 获得绿灯。
- 未完成项：U04a 仍缺正式独立 Browser QA，所以状态不是 `verified`。Connector 展示层属于 U04b，并受仓库根 `AGENTS.md` Connector Module Hold 约束。
