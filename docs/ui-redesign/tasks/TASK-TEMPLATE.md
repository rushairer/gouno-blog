# Uxx：任务标题

状态：planned。前置：填写任务 ID。

## 新会话提示词

先阅读根目录 `AGENTS.md`、`docs/ui-redesign/PLAN.md`、`migration.json`、`MIGRATION.md`、本任务卡和当前相关仓库的 `git status`。核对前置任务结果与当前 HEAD；若前置不满足，停止实现并记录阻断。只处理本卡范围，保留未相关改动，使用 `apply_patch`，不降低测试门槛，不修改 Connector 冻结行为。完成后运行匹配的测试/构建/浏览器验证，更新清单和本卡结果。

## 目标与范围

填写具体路由、子视图、状态和组件。

## 不包含

填写明确排除项。

## 验收

- [ ] 功能和现有 API/权限语义保留。
- [ ] loading/empty/error/disabled/unauthorized/success 状态有证据。
- [ ] light/dark、桌面/平板/移动要求有证据或明确未验证。
- [ ] 相关测试、质量检查和构建通过。
- [ ] `migration.json`、`MIGRATION.md` 和本卡结果已更新。

## 结果

- 起始 HEAD / 分支：未执行
- 改动：未执行
- 验证证据：未执行
- 未完成/阻断：未执行
- 下一任务交接：未执行
