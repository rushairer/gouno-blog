# Q01b：Workflow for_each 输出与失败重试

状态：planned。来自 Q01a 实际数据库门禁的新业务失败；本轮仅记录，尚未修改执行器。

## 证据

相同输入 `[{"value":"first"},{"missing":true},{"value":"third"}]`，内部 output 步骤读取 `/item/value`。
实际三个迭代都返回 `first`，聚合为 succeeded=3、failed=0；现有断言要求第二项失败，其余两项分别成功。

失败用例：

- `internal/workflow.TestForEachCanAggregatePartialFailures`
- `internal/workflow.TestRetryFailedForEachIterationUsesOriginalInput`：由于原运行没有记录失败项，重试被拒绝为 `retry can target only failed resource iterations`。

最终证据路径与总门禁计数见 [Q01a](Q01a-fresh-install.md)。这些测试在新增真实 principal 夹具后才到达业务断言；其断言没有修改。两个独立的更新后门禁运行复现相同失败，无自动重试。

## 下一任务

阅读 AGENTS、路线图、Q01/Q01a 结果，保留整个 `codex/q01-ci` 未提交工作区。先核实 for_each 迭代范围、历史步骤输出复用条件、step_id + iteration 唯一键及 failed-iteration retry 路径，再提出聚焦修复。

保留原资源快照、权限、预算、审批、失败统计和原始输入语义。验证同一运行内多个迭代不会错误复用输出，正常恢复/重复执行仍幂等，重试只作用于原失败项。不得修改 Connector 或降低/跳过现有断言。

修复后运行完整 Q01 门禁、相关 race 和常规检查。只有所有必跑测试通过，才能完成 Q01 并解锁 Q02。本卡不扩大 Q01a 当前授权范围。
