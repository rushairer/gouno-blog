# U04a：AI 工作台

状态：verified。前置：U03d（已 verified）。

## 目标与范围

迁移 `/admin/ai-ops` overview、inbox、automation、records、advanced，以及 Agent、Workflow、Run、Approval、Preview、输入/工具/Provider/Embedding/Skill/Knowledge 子视图。保留 `tab`、`record`、`run`、`workflow` 参数语义。

## 验收

- [x] 运行详情、审批、预览、失败、禁用和空数据状态由当前组件/自动化回归覆盖。
- [x] 工作流编辑、版本和输入/工具配置未改变保存/API 语义；native `alert/confirm/prompt` 已从产品源码清零并由 AST 门禁阻止回流。
- [x] 大量记录、长输出和移动端宽内容已完成独立 Chromium rendered/browser QA，并保留可复核 artifact。
- [x] 相关 API、权限、typecheck、coverage、production build 与 Docker image 门禁无回归。

## 实现与边界

- Advanced Settings：Agents、Skills、Tools、Providers、Knowledge 已使用 canonical Card/Alert/Tag/Button/Select 等组合；早期 `agent-table-panel`、`provider-identity`、`secret-mask`、`agent-state`、`knowledge-workspace` 等运行时结构已退出。
- Operations / Workflow：native confirm/prompt 已替换为受控 Modal/Form；退休的 overview/approval/operations/editorial/Agent/Workflow shell CSS 已分批删除并加入防回流门禁。Workflow 对 generic `.btn` 的 CSS 覆盖已经归零。
- CSS 边界：`agent-console.css` 中 generic `.btn` 仅剩 `agent-row-actions .btn` 一个显式白名单；该规则仍与 ConnectorWorkspace 共享，因此在 Connector Module Hold 解除前不越界修改。canonical `[data-slot]` 与 primitive ownership 由 `lint:ui` 强制属于 `@gouno/ui`。
- 本轮长内容压力测试发现 Workflow JSON/Markdown 宽内容需要显式 containment；仅在既有 AI feature-scoped CSS 内补充 `min-width: 0`、`max-width: 100%` 与 JSON 横向内部滚动，没有新增全局 primitive override。
- 本轮真实 Chromium 交互发现 `AISettings` 的动态 `labels` Proxy 在 React 开发态 instrumentation 读取 Symbol property 时会抛出 `TypeError: Cannot convert a Symbol value to a string`，导致受控 Modal/Tab 状态提交中断。现已令 Proxy 仅对 string key 调用 i18n，Symbol key 安全返回 `undefined`；产品 URL 参数语义保持主线原实现，既有单测 contract 未删除或放宽。
- Connector 展示层属于 U04b，并受仓库根 `AGENTS.md` Connector Module Hold 约束；本轮未修改 Connector 产品行为。

## Browser QA 证据

当前会话没有 Browser plugin，因此按 frontend-testing-debugging fallback policy 使用仓库长期 Playwright harness + GitHub-hosted Chromium，未把静态检查冒充 rendered QA。

- 最终 workflow run：`34761329896`，PR #211 head `96754dc4aa4f4b5647e3bb572c52bd5aa5ece786`。
- Chromium / Playwright 最终结果：`146 passed`；其中 U04a 新增 **87** 项（80 个矩阵 + 7 个关键交互），既有 U03d 59 项同时继续通过。
- U04a 矩阵：AI Operations 的 overview / inbox / automation / Agent records / Workflow records，以及 AI Settings 的 Agents / Skills / Tools / Knowledge / Providers，共 10 个子视图 × 1440/1024/768/390 × light/dark = 80 项。
- 矩阵逐页验证实际主题、Blog Admin brand、canonical page container、无 document-level horizontal overflow、无未知 API fixture 请求、无 console warning/error/pageerror，并保存 full-page screenshot。
- 关键交互 7 项全部通过：移动 operational tab + query semantics、legacy `tab=advanced&section=providers` 重定向、失败审批长 proposal、Agent 长 Markdown run detail、Workflow 长输出及 `run` query、Skill Copy canonical Modal、Provider 编辑后切换 Knowledge/Embedding 配置。
- 最终 artifact：`blog-admin-browser-acceptance`，artifact ID `10319540400`，digest `sha256:c380295786ccdf2f8d1d1bde0ce4785ab2ce3c5e10419586a55191c7ae6154d7`。
- 人工抽查：390px Agent 长输出、Workflow 长输出 dark、Skill Copy Modal、Provider/Knowledge 配置视图；实际截图与 overflow、主题和交互断言一致。

## 质量门禁

- 最终标准 CI run `34761329918` 全绿：Frontend quality、Backend quality、Seed quality、Compose config、Dependency review、Isolated database integration 均通过。
- Frontend quality 覆盖 format、lint、UI/CSS contracts、TypeScript、coverage 与 production build；没有降低 coverage、删除 contract assertion 或放宽 lint 获得绿灯。
- 最终 Images run `34761330012` 的 frontend / backend / seed 三镜像构建均通过。

## 明确未重放的范围

- U04a 浏览器 session/API 使用测试层 fixture；它不是一次新的真实 Gosso 登录，也没有修改生产认证或后端接口所有权。
- 浏览器验收没有提交真实 Agent/Workflow/Provider/Embedding 写操作、审批、删除等 destructive mutation；对应保存/API 语义继续由既有组件、API 与单元/集成测试保护。
- U04b Connector 继续 `hold`；Sandbox connector tab 仅作为既有导航边界存在，不纳入本次 U04a rendered acceptance，也未触碰 OAuth、凭证、Sandbox、Outbox、审批、Mock 投递、重试或撤销行为。

## 结果

U04a 通过。代码级 AI Workspace 收敛、长内容/移动宽内容 rendered matrix、关键受控交互、console/pageerror 健康度、标准 CI、镜像构建和浏览器 artifact 已形成闭环，状态由 `implemented-ci-verified` 提升为 `verified`。

后续不再扩大 U04a UI/CSS 重构范围；具体视觉问题按页面/组件点状修复。阶段 4 的剩余阻断仅来自 U04b Connector Module Hold，U04c 继续保持 `blocked-by-U04b-hold`。
