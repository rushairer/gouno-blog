# Q01：CI 与数据库集成测试形成有效门禁

状态：blocked（空库迁移已由 Q01a 修复；两个 Workflow 失败待 Q01b）。前置：阅读 [路线图](../roadmap.md) 与 [基线](../baseline.md)。

## 目标与范围

让现有核心数据库集成测试在隔离环境真正执行，并让本地前端质量入口与 CI 对齐。入口：`.github/workflows/ci.yml`、`blog-frontend/package.json`、`blog-backend/internal/*/*integration_test.go`、`internal/migrations`、贡献文档。

允许修改测试设施、CI、质量脚本及对应文档。不要顺便重构业务。发现真实业务失败时保留复现，记录为修复项；只有与本门禁直接相关且边界清楚的小修复才纳入本任务。

## 实施步骤

1. 盘点数据库测试、所需扩展/种子/迁移入口、并行执行方式和 Skip 条件。核实贡献文档认证 smoke 的真实入口，不虚构不存在的命令。
2. 设计一次性测试 Postgres。禁止连接用户开发数据库或生产数据库；使用显式测试 DSN、独立数据库/schema 与可追溯清理。必要时按测试组隔离，避免跨包并发污染。
3. 在 CI 和本地提供同一可复现入口：等待数据库就绪、应用真实迁移和必要种子、运行核心集成测试、输出成功/失败/跳过数。
4. 定义必跑的核心测试清单或可靠标记。CI 缺 DSN、连接失败、迁移失败、核心测试被跳过或零用例执行时必须失败；正常纯单测路径可保留有说明的本地 Skip。
5. Connector 现有测试如自然随全套运行可记录结果，不改变其行为/测试预期；冻结区域失败单列，不通过修改冻结代码让门禁变绿。核心必跑清单不得假装涵盖 Connector 完整性。
6. 将 CSS 检查纳入 CI 实际路径，协调 `quality`、贡献文档和 PR 模板，减少重复命令。保留现有 race、vet、漏洞与部署契约检查。
7. 测量同口径覆盖率与执行时间；不要降低原门槛或用新 exclusions 掩盖缺口。后续 ratchet 根据实际稳定结果制定。

## 验收

- [ ] 干净隔离数据库可初始化、迁移，并实际运行指定核心集成测试。
- [x] 核心测试名/数量和 Skip 情况可观察；CI 不是只有绿灯没有执行证明。
- [x] 缺失/错误 DSN 和失败迁移产生非零退出；使用测试设施验证，不能故意破坏用户数据。
- [ ] 重复运行结果稳定，包间没有共享夹具污染；有意义的并发路径通过 race。
- [x] 前端实际执行格式、Lint、类型、UI、CSS、测试和构建。既有标题不稳定性若再次出现，保留失败并交 Q03，不靠重试掩盖。
- [x] 工作流语法与脚本检查通过，本地命令可复现；未运行远端 CI 时明确写“待远端验证”。
- [x] 文档和 PR 模板指向真实存在的验证入口。

## 交付

一份聚焦 CI/测试基础设施的 diff，包含本地执行说明、隔离/清理方式、验证证据。数据库测试只能作用于可丢弃资源。不要发布镜像或部署。

## 原 Q01 结果（历史失败证据，当前状态见下方续验）

- 起始 HEAD：`cdc84aaa3f8f506adce9ee96ef7187f79dddbf58`；工作分支 `codex/q01-ci`。原有 README 和未提交质量计划均保留在同一工作区。
- 实现：`scripts/check-db-integration.py` 创建独立 pgvector 容器/逐包数据库，真实迁移，自动清单和 JSON 终态门禁；`internal/testsupport/dbsetup` 为测试专用迁移命令。CI 新增 database-integration job，前端改为 `npm run quality`；贡献说明和 PR 模板同步。
- 范围偏差：未改业务或历史迁移。真实空库在 `086_community_principal_identity.sql` 的 active owner 前置检查失败；不能满足空库成功及全部集成路径 race 验收，记录 [Q01a 前置修复卡](Q01a-fresh-install.md)。
- `python3 scripts/check-db-integration.py`：退出 1，6.22 秒（本地有缓存，非冷启动预算）。必跑 22 个：2 pass / 1 fail / 0 skip / 19 missing（初始化失败）。其中核心 21 个，Connector 1 个单独观察并未执行；不得称 Connector 验证通过。
- 失败用例：`internal/migrations.TestUpAppliesCurrentSchemaAndIsIdempotent`；`community principal migration requires at least one active owner (P0001)`。迁移包代码覆盖 69.2%，不能与全仓覆盖率混比。
- 两个独立容器的空库在同一迁移失败。第一次设施遇初始化错误即终止；第二次改进为完整记录各包初始化失败，无自动测试重试。
- 三项实际负向探针：缺失 DSN / 不存在数据库 / 不兼容 schema 迁移均退出 1；门禁单测还覆盖零执行、缺失、跳过、子测试失败、外部 DSN 拒绝和制品目录复用拒绝。
- `python3 -B -m unittest discover -s scripts -p 'test_check_db_integration.py'`：退出 0，6/6 通过。质量目录 9 份文档链接/代码块检查通过。
- 前端 `npm run quality`：退出 0，38 文件 / 148 测试通过；语句 55.07%、分支 46.76%，构建通过。此次标题失败未复现，不宣称 Q03 已修复。
- 后端 `go test -coverprofile=/tmp/q01-backend.cover ./...` / `go vet ./...` / `go test -race ./...`：均退出 0；全仓语句覆盖 22.9%，DSN 未启用的集成用例仍跳过，此结果不能抵消集成门禁失败。
- 工作流：`go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/ci.yml` 退出 0；`git diff --check` 通过。
- 证据：`/tmp/q01-integration-current.log`、`/tmp/q01-frontend.log`、`/tmp/q01-backend.log`、`/tmp/q01-race.log`；完整制品在 `/var/folders/13/sfqfhst9345_jdvj2cq6877r0000gn/T/gouno-db-ci-hovvhnd9/`，临时路径不保证长期保留。summary 中 failure_probes 全为 1、cleanup_exit_code 为 0、ok 为 false。
- 清理：两次运行创建的容器已移除，标签过滤确认无残留。未连接开发或生产数据库。
- 远端 CI、Linux 冷启动及制品上传：待远端验证；本次不推送。未运行身份浏览器 smoke；确认仓库没有贡献文档原称的独立入口，已明确限制并交 Q05。未重复漏洞扫描及无关部署验证。
- 提交 / PR / 合并：无；所有改动在 `codex/q01-ci` 工作区，尚未暂存提交。
- 自审：原覆盖门槛、安全包 ratchet、普通测试/race/vet/漏洞及 Compose/auth 契约 job 均保留；Connector 源码、测试和历史迁移未改。新增门禁将如实失败，不能把当前分支当作全绿基线。
- Q02 前置状态：测试设施可用，但迁移阻断未解决；先完成 Q01a 和 Q01 剩余验收，再开始 Q02。Q03 仍需调查既有不稳定测试。


## Q01a 后续验（2026-09-05）

空库全量迁移及身份回归已通过；原 086 阻断解除。用户批准的历史修订例外及身份测试见 [Q01a](Q01a-fresh-install.md)。原始失败记录保留用于追溯，不再代表当前迁移状态。

完整门禁：必跑 30 个，28 pass / 2 fail / 0 skip / 0 missing；所有包实际执行，race 开启。核心必跑 29 个，Connector 1 个原样通过。Workflow 的部分失败聚合及失败项重试两项仍失败，见 [Q01b](Q01b-workflow-iterations.md)。未降低门槛、跳过测试或修改 Connector。

前端质量、后端全仓 race/vet、Python 门禁单测、CI 静态检查再次通过，实际数字、日志和限制见 Q01a 结果。Q01 仍 blocked，不能勾选全套集成验收或解锁 Q02；先完成 Q01b。所有未提交改动与计划在原 codex/q01-ci 工作区，其他工作区需完整取得前置文件，不能只检出当前 HEAD。
