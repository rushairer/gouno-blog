# U04b：Connector 展示层

状态：in-progress。前置：U04a 主体实现已进入主线；2026-09-26 用户已显式授权 Connector work，因此 U04b 可在保持既有 OAuth / credential / Sandbox / Outbox / delivery 状态机不变的前提下继续。

## 目标与范围

迁移 Connector workspace 的 Profile 表单、四种类型、Sandbox 约束提示、OAuth 发起/回调反馈、凭据字段、Outbox 入队、审批、Mock 投递、重试、撤销及失败/禁用状态的展示层。

## 不包含

不得修改 OAuth、凭证生命周期、Sandbox、Outbox、投递、审批或重试状态转换；不得添加自动业务事件调用。Connector Module Hold 未被用户显式解除前，也不得借 UI/CSS 清理之名继续重构 Connector frontend workspace。

## 验收

- [x] 用户已显式授权 Connector work；行为 diff 必须继续限制在既有 OAuth / credential / Sandbox / Outbox / delivery 契约内。
- [ ] 回调参数、失败反馈和禁用状态不丢失。
- [ ] 敏感字段仍遵守现有显示/隐藏规则。
- [ ] 现有 Connector 测试原样通过并单独报告。

## 结果

- 2026-09-26：Hold 已因用户显式授权 Connector work 而解除到本任务范围内；授权不等于允许隐式扩展生产 Connector 行为。
- 人工对照发现旧迁移记录与当前事实冲突：历史 migration row 曾写 `verified`，但 U04b 本身长期处于 Hold，且 Canonical audit 明确要求 Connector states / Drawer / responsive 继续显式 CSA review。当前以 manual-first certification ledger 与新 U04b 证据为准。
- 当前 Canonical 与 Product 各有一半语义不完整：Canonical 暴露 Product 不存在的 connected/degraded/lastChecked/scope 假状态，而 Product 真实 config JSON、credential、Mock OAuth callback 与 Outbox payload/幂等输入未被 Canonical 完整表达。
- U04b 将先修正 Canonical Fixture 的产品语义，再进行 Product reverse migration；Backend Connector 状态机、OAuth/PKCE、credential encryption、Search Console read-only、Sandbox、Outbox approval/delivery/retry/revoke 均保持不变。
- `.agent-row-actions .btn` 的历史“Connector Hold”解释已失真：当前 ConnectorWorkspace 不使用该 wrapper。该 CSS 例外留到 U04c 单独归因/清理，U04b 不跨范围误删。
