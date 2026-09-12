# U04b：Connector 展示层

状态：hold。前置：U04a 主体实现已进入主线；当前受仓库 `AGENTS.md` Connector Module Hold 约束。

## 目标与范围

迁移 Connector workspace 的 Profile 表单、四种类型、Sandbox 约束提示、OAuth 发起/回调反馈、凭据字段、Outbox 入队、审批、Mock 投递、重试、撤销及失败/禁用状态的展示层。

## 不包含

不得修改 OAuth、凭证生命周期、Sandbox、Outbox、投递、审批或重试状态转换；不得添加自动业务事件调用。Connector Module Hold 未被用户显式解除前，也不得借 UI/CSS 清理之名继续重构 Connector frontend workspace。

## 验收

- [ ] 用户显式授权 Connector work 后，行为 diff 仅限获批范围。
- [ ] 回调参数、失败反馈和禁用状态不丢失。
- [ ] 敏感字段仍遵守现有显示/隐藏规则。
- [ ] 现有 Connector 测试原样通过并单独报告。

## 结果

- 当前状态：ConnectorWorkspace 已消费 canonical Gouno UI primitives，但仍与 `agent-table` / `agent-row-actions` 等兼容展示样式存在共享边界。
- 明确阻断：根 `AGENTS.md` 要求 frontend workspace 同样受 Connector Module Hold；除非用户显式点名 Connector 工作，不得添加、修改、启用、删除或重构 Connector 行为/展示边界。
- 本轮处理：非 Connector 的 AI/Workflow CSS 已收口到不再依赖 generic `.btn`；唯一保留的 `.agent-row-actions .btn` 被标记为 Connector Hold allowlist，防止后续误删或无限扩大例外。
- 下一步：保持 hold。只有收到显式 Connector 指令后才启动 U04b，并单独做行为 diff、测试和浏览器证据。
