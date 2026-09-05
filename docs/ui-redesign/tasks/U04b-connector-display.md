# U04b：Connector 展示层

状态：planned。前置：U04a。

## 目标与范围

迁移 Connector workspace 的 Profile 表单、四种类型、Sandbox 约束提示、OAuth 发起/回调反馈、凭据字段、Outbox 入队、审批、Mock 投递、重试、撤销及失败/禁用状态的展示层。

## 不包含

不得修改 OAuth、凭证生命周期、Sandbox、Outbox、投递、审批或重试状态转换；不得添加自动业务事件调用。

## 验收

- [ ] Connector 源码的行为 diff 仅限展示层。
- [ ] 回调参数、失败反馈和禁用状态不丢失。
- [ ] 敏感字段仍遵守现有显示/隐藏规则。
- [ ] 现有 Connector 测试原样通过并单独报告。

## 结果

- 起始基线：未执行
- 行为 diff 审阅：未执行
- 验证/阻断：未执行
