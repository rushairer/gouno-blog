# 隔离数据库集成门禁

从仓库根目录执行（需要 Python 3、模块指定版本的 Go 和可用 Docker daemon）：

```bash
python3 -m unittest discover -s scripts -p 'test_check_db_integration.py'
python3 scripts/check-db-integration.py
```

CI 使用完全相同的入口。无需设置数据库环境变量；若已设置
`BLOG_TEST_POSTGRES_DSN`，入口直接拒绝，避免误用个人开发/生产数据库。
纯 `go test ./...` 仍允许未配置 DSN 时跳过现有集成测试，不代替本门禁。

## 数据与隔离

- 每次创建名称随机且带 `gouno.test=q01` 标签的容器，使用与开发栈一致的
  `pgvector/pgvector:pg15`，支持 vector 和 pgcrypto 扩展。
- 不复用 Compose、项目网络、数据库或持久卷。PGDATA 使用 tmpfs；仅发布随机的
  loopback 端口。随机密码只传入子进程环境，不写入报告。
- 每个含 `*_integration_test.go` 的 internal 包获得独立数据库；包间串行执行，
  保留用例内部的实际并发测试并启用 `-race`。包内仍须自行清理测试夹具。
- 迁移包测试从空库执行真实 `migrations.Up` 并验证幂等性；其他包先运行同一迁移入口，
  包括迁移自带的必要初始数据，不使用简化 schema。
- 正常结束、测试失败、Ctrl-C 和 SIGTERM 都尝试删除本次容器及其卷。
  无法捕获 SIGKILL/主机断电；必要时只按日志中的精确容器名清理，禁止批量删除其他容器。

## 怎样阻止假绿灯

入口自动枚举 `blog-backend/internal/*/*_integration_test.go` 中顶层
`func TestX(t *testing.T)` 作为必跑清单，报告具体测试名。新增测试应沿用该签名；
改用其他组织方式时必须同步门禁发现规则。空清单或缺少迁移包直接失败。

完整运行每个相关包的测试，而非仅通过 `-run` 选取部分；使用 `-count=1` 禁用测试结果缓存。
检查 `go test -json` 的终态、包退出状态、缺失用例与所有子测试的失败/跳过事件。
任何必跑用例缺失、任何跳过、失败或非零退出均失败，不自动重试。

Connector 包按原样运行并独立标记为 `frozen-connector-observation`，失败同样使总门禁失败，
但必须单独报告；本设施不授权修改冻结模块，也不宣称其产品设计完整。

每次还在专用负向测试数据库验证：迁移命令缺少 DSN、连接不存在的数据库、
遇到不兼容 schema 均非零退出。Python 单测验证零执行、缺失、跳过及子测试失败不会被父测试通过掩盖。

## 证据与覆盖率

默认输出到新临时目录并打印路径；可用 `--output /absolute/artifact/directory`
指定目录。保留逐包 JSONL、stderr、coverage 和总 summary.json。
Summary 记录必跑名称、通过/失败/跳过/缺失、退出状态、耗时及清理结果。
CI 保留文本证据制品 7 天，不上传临时工具二进制或数据库内容。

新增集成报告只覆盖相关包；现有后端全量普通测试 coverage floor、安全包 ratchet、
race/vet/漏洞检查均保留。不可把两个执行范围的百分比直接比较，也不降低原门槛。

这不是认证浏览器 smoke、性能测试或生产数据库演练。远端 CI 在提交推送前仍属未验证。
