# Q01b：Workflow for_each 输出与失败重试

状态：verified（本地验收通过，未提交/集成）。日期：2026-09-05。

## 基线与问题核实

开始分支 `codex/q01-ci`，HEAD `c1c61581efe7c6c379d61380ddd02301f7515982`，工作区干净。此前 Q01/Q01a 的迁移、计划与测试设施已包含于该提交；保留全部前置工作，本轮不改 Connector、历史迁移或授权逻辑。

修改前实际运行 `python3 scripts/check-db-integration.py`：退出 1，22.45 秒，复现两项失败：

- `TestForEachCanAggregatePartialFailures`：输入 first / 缺失 value / third，实际三个输出都为 first，统计成功 3、失败 0。
- `TestRetryFailedForEachIterationUsesOriginalInput`：由于缺失 value 的项被错误判为成功，原运行无可重试失败项。

证据：`/tmp/q01b-before.log`。没有通过测试重试或更改断言抹掉失败。

## 根因与实现

`executeSteps` 恢复成功步骤时，只按 `workflow_run_id + step_id` 查询。记录写入和唯一键却包含 `iteration`；后续迭代因此误读其他项的成功输出。

读取条件增加同一 iteration：顶层使用已有约定 -1，循环内使用当前索引。其余执行、资源快照、重试选择、预算、权限、审批和输入逻辑不变，无 schema 变更。

原两项测试保留全部断言。部分失败测试的全失败分支现在能够到达通知路径，补齐真实通知服务测试依赖，避免 nil service 掩盖业务断言。

新增串行 1 worker / 并发 3 workers 的断点恢复回归：先通过真实执行器保存一个子项 checkpoint，然后恢复整体运行；各项保留自身输出，已有 checkpoint 不重算，其余项正常执行。再次执行后输出和步骤记录数不变。原重试测试增加拒绝重试已成功项的断言，仍验证仅重跑原失败索引及原始输入。

## 验证证据

| 检查 | 实际结果 |
| --- | --- |
| 完整数据库门禁，含 race | 两个独立一次性容器均退出 0；31 个必跑全部通过，0 fail / skip / missing |
| 必跑范围 | 核心 30 个，Connector 原测试 1 个单独观察 |
| 包测试事件（含子测试） | migrations 13、access 43、agent 30、repository 8、workflow 24、Connector 1，全部通过 |
| 负向门禁探针 | 缺 DSN、不存在数据库、失败迁移全部按预期非零 |
| `go test -race -coverprofile=/tmp/q01b-backend.cover ./...` | 退出 0，全仓语句覆盖 22.9%；普通路径未设 DSN 的集成测试跳过，真实 DB 证据见专门门禁 |
| `go vet ./...` | 退出 0 |
| 前端 `npm run quality` | 退出 0，38 文件 / 148 测试；格式、Lint、UI/CSS、类型、构建通过，语句 55.18%、分支 46.85% |
| Python 门禁单测 | 退出 0，6/6 |
| actionlint v1.7.7 | 退出 0 |
| `git diff --check` | 通过 |

第一次通过用时 30.42 秒；有并行全仓检查，本地有缓存，不是冷启动性能预算。
日志：`/tmp/q01b-after.log`、`/tmp/q01b-repeat.log`、`/tmp/q01b-backend.log`、`/tmp/q01b-vet.log`、`/tmp/q01b-frontend.log`、`/tmp/q01b-actionlint.log`、`/tmp/q01b-runner-tests.log`。
第一次通过制品：`/var/folders/13/sfqfhst9345_jdvj2cq6877r0000gn/T/gouno-db-ci-qazcfv6k/`。

数据库只用新建随机回环端口、tmpfs 容器及逐包隔离数据库，清理结果记录在 summary。复验是 Q01 明确要求的独立环境稳定性验收，不是失败后原样重试。临时证据不保证长期保留，本卡保存结果，脚本支持重新产生证据。

## 自审、限制与交接

生产代码仅修改成功步骤读取的迭代条件，与既有唯一键匹配；写入、迁移、Connector 和安全门槛未改。现有快照重放、权限范围和审批相关测试随完整门禁通过。不主张测试覆盖了全部 Workflow 产品行为。

额外代码观察：嵌套循环的完整父级迭代路径、不同循环复用子步骤 ID 的命名空间仍需单独回归与设计审查；当前 schema 只有一个 iteration，校验的 ID 集合按层建立。这是既有模型范围问题，列入路线图 D08；本轮不扩展身份键/schema 或改变已有嵌套语义。

未测：远端 CI/Linux 冷启动、制品上传、浏览器认证全链路、真实 Provider 调用/人工审批恢复、生产负载与部署。本轮未重复漏洞扫描、备份恢复或无关部署契约执行。

Q01 本地门禁阻断解除，Q01/Q01a/Q01b 达到本地 verified；Q02 可在包含本次修复与全部计划的基线上开始。当前修复和状态文档未提交，其他 worktree 不能只检出 c1c6158 就视为包含 Q01b。未推送、合并、发布或部署。


最终复验：19.88 秒，退出 0。制品目录 `/var/folders/13/sfqfhst9345_jdvj2cq6877r0000gn/T/gouno-db-ci-emr5n8aj/`，summary 的 ok=true、cleanup_exit_code=0。两次全部必跑通过，三项负向探针均退出 1；最终标签容器查询为空。质量文档链接和代码块检查通过。HEAD 保持 c1c61581efe7c6c379d61380ddd02301f7515982，本次变更未提交。
