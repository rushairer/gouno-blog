# Q01a：新安装迁移与身份回填

状态：implemented（本任务身份回归通过；全门禁仍被 Q01b 阻断，未集成）。2026-09-05。

## 决策与范围

原 086/088 无条件要求 Owner，并以最早 Owner 兜底身份；089 禁止系统种子空创建者。用户已明确批准对 086/088/089 做定点历史修订，同时增加准备迁移与 090。这是有记录的例外，见 [ADR](../adr-q01a-identity-migrations.md)，不能据此改写其他历史迁移。

- 在 `codex/q01-ci` 原工作区实现；起始及当前 HEAD 均为 `cdc84aaa3f8f506adce9ee96ef7187f79dddbf58`。
- 保留原 README、全部计划、CI 和测试设施改动；没有 reset、暂存、提交、推送、PR、合并、发布或部署。
- Connector 源码、相关函数/路由、测试与迁移未修改；只运行原测试。

## 实现

- 085z：创建来源字段、68 条完整内容/版本关系种子指纹、批准记录、旧字段证据与已丢失源字段的归属快照，以及静态回填清单/函数。
- 086/088：移除 Owner 与裸 subject 推断，只保留已有有效 principal 或使用明确批准的精确身份。未解决记录报表/行/字段，事务回滚。
- 089：删除旧字段前再次校验，允许 system 模板 NULL 创建者；090 按来源建立身份约束。已执行旧迁移不重跑、不撤销旧归属。
- Starter Pack 受控插入使用 system，不选普通用户或 Owner；保留停用、预算和审批行为。来源字段加入 Go/前端响应类型。
- 人类 API 不采信请求的来源/创建者，创建和更新从认证上下文取得 actor；原模板归属不改，新 Skill/Workflow 版本记录 actor。
- 增加本地 `identity-backfill report` / `approve`。允许清单、原值比较、目标精确存在、冲突检测、整批事务、历史批准保留；不创建身份或授权。操作步骤见 [说明](../identity-backfill.md)。
- 更新核心旧测试夹具：真实普通 principal、必需 Skill Version、Workflow 通知依赖。原业务断言保留；未添加测试 Owner 到全新安装路径。

## 实际验证

完整命令及结果以本节最终证据为准；早期运行失败用于定位，不靠自动重试掩盖。

| 检查 | 结果 |
| --- | --- |
| Q01 一次性数据库门禁 | 退出 1：必跑 30 个，28 pass / 2 fail / 0 skip / 0 missing |
| 迁移包 | 11 个必跑顶层测试通过；含子测试共 13 pass，无失败/跳过 |
| Access / Agent / Repository | 43 / 30 / 8 个测试事件通过 |
| Connector 原测试 | 1 pass，仅冻结区域观察，不代表产品完整性 |
| Workflow | 19 pass / 2 fail；失败列入 Q01b |
| 后端 `go test -race -coverprofile=/tmp/q01a-backend.cover ./...` | 退出 0；全仓语句 22.8%，未设 DSN 的数据库测试跳过，不抵消专门门禁失败 |
| 后端 `go vet ./...` | 退出 0 |
| 新 CLI / 人类请求绑定测试 `go test -race ./cmd/gouno ./internal/controller` | 退出 0 |
| 前端 `npm run quality` | 退出 0；格式、Lint、UI/CSS、类型、148/148 测试、构建通过；语句 55.18%、分支 46.86% |
| 门禁 Python 单测 | 退出 0，6/6 |
| actionlint v1.7.7 | 退出 0 |
| `git diff --check` | 通过 |

迁移回归实际涵盖：空库全量与二次幂等、无系统 Principal/Membership/Owner；普通用户存在时 Starter Pack 不归属给该用户；精确跨 issuer 同 subject 批准、无映射失败；未知目标、越界表、原值变化、冲突、整批回滚；修正原值批准后继续且保留旧批准；失败 DDL/ledger 回滚；变更种子内容拒绝自动认定；真实旧 086/088 中间态和完整旧 089 前向升级；已有创建者与角色保留；评论正文和授权审计保持；旧身份文本证据保留；访客/定时执行/未审核语义；089 删除前再校验；system 模板被人编辑后原归属保留，新版本归属真实 actor。

请求绑定测试覆盖三类模板的伪造 system/legacy、他人 principal、NULL principal，以及没有认证上下文。数据库约束拒绝 human 无创建者及 system 带人类创建者。没有修改认证 SDK 或权限来源。

## 未通过与后续

`TestForEachCanAggregatePartialFailures` 实际复用了第一项输出，失败统计不正确；`TestRetryFailedForEachIterationUsesOriginalInput` 因此没有可重试失败项。已记录 [Q01b](Q01b-workflow-iterations.md)，未改执行器、断言或测试门槛。Q01 保持 blocked，Q02 不解锁。

未测：远端 CI/Linux 冷启动与制品上传、具体已有实例的升级和备份恢复、真实浏览器登录/创建/编辑全链路、并发多进程迁移、生产规模性能。本轮没有重复漏洞扫描或无关部署契约执行；现有 CI job 保留。

所有数据库运行只使用新建随机端口、tmpfs 隔离容器及子数据库，失败也清理。临时日志不保证永久保留；可用同一脚本复现。永久可读的本节结果随工作分支传递。


## 最终证据位置与自审

- 完整数据库日志：`/tmp/q01a-evidence-db.log`，退出 1，19.88 秒（本地缓存环境，非冷启动预算）。
- 完整制品：`/var/folders/13/sfqfhst9345_jdvj2cq6877r0000gn/T/gouno-db-ci-yewvdi8i/`，包含逐包 JSONL、coverage、summary.json。负向探针均按预期非零；cleanup_exit_code=0，ok=false。
- 其他日志：`/tmp/q01a-backend.log`、`/tmp/q01a-vet.log`、`/tmp/q01a-cli-controller.log`、`/tmp/q01a-frontend.log`、`/tmp/q01a-actionlint.log`、`/tmp/q01a-runner-tests.log`。
- 自审补强：保留已有 principal 的种子不自动改来源；初始化冲突不覆盖旧创建来源；旧来源缺失报告采用迁移时快照，避免误报后续正常 API 写入；批准后再次检查当前记录是否仍需人类身份。
- 原 086/088/089 测试副本与 HEAD 内容逐字节比对通过。Connector 命名路径无 diff；混合 Agent controller 文件只修改核心模板保存逻辑。
- 最终标签容器查询为空。全部源码/计划保持未提交，HEAD 不变；Q02 前置未满足，下一步为 Q01b。
