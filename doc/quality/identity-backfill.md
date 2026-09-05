# 身份回填操作说明

此命令仅针对人工审核的历史身份映射，不负责建立 Owner、创建身份或授予权限。先阅读 [ADR](adr-q01a-identity-migrations.md)。测试只能使用 [一次性数据库门禁](database-tests.md) 创建的资源。

## 准备与报告

有历史数据的实例先备份，停止旧应用写入，保证只有一个迁移进程。使用现有应用迁移入口执行迁移；发生身份阻断时，085z 的准备结构已经提交，失败文件事务回滚。不要修改 ledger、伪造 Owner 或直接删除失败记录。

在 `blog-backend` 下使用本地构建的 gouno 命令（下面为源码运行形式；配置参数与现有命令一致）：

```sh
go run ./cmd identity-backfill report --config_path ./config --env development
```

命令不自动执行迁移，report 使用只读一致性事务。输出 `source_table`、`row_id`、`source_column`、`original_value` 和原因；旧源字段已被删除的历史归属只能列为待核查，不能用现存 principal 证明原始身份。输出含历史身份文本，应按审计资料保管，勿公开粘贴。

## 批准

人工通过外部证据核对每个记录及目标精确身份，建立 JSON 数组，例如：

```json
[
  {
    "source_table": "comments",
    "row_id": 123,
    "source_column": "author_subject",
    "original_value": "historical-subject",
    "issuer": "https://sso.example.test",
    "subject": "verified-subject",
    "evidence_reference": "restricted-audit/case-123"
  }
]
```

```sh
go run ./cmd identity-backfill approve --config_path ./config --env development \
  --file ./approved-mappings.json --approved-by operator-id \
  --reason 'Verified against restricted audit case 123' --confirm
```

命令最多接受 1 MiB、1000 条映射；拒绝未知 JSON 字段和尾随对象。表与字段采用 SQL 静态允许清单（`blog_identity_fields()`），不能批准任意表。目标精确 issuer/subject 必须已存在，不创建 alias。原值 JSON null 与空字符串严格区分。批准人是拥有受控本地数据库操作权限的操作人标识，命令不代替组织的审批/双人复核流程。

整批锁定来源行并验证原值、是否已有 principal、是否确需人类身份。重复相同批准幂等；同一原值的冲突批准失败。若业务原值已变，旧批准不生效；重新调查并提交新原值的批准，旧记录保留。已确定为系统种子、访客或未审核的记录拒绝人类批准。

批准后重新执行正常迁移入口。成功后旧字段移除，批准与迁移保存的旧值继续作为审计证据。已执行旧 086/088/089 所丢失的来源不可通过该命令恢复或重写；应依赖备份/外部证据另行制定修复。

## 本地验收

```sh
python3 scripts/check-db-integration.py
```

在仓库根目录执行。全门禁不会因身份回归通过而忽略其他失败；当前 Workflow 剩余失败见 [Q01b](tasks/Q01b-workflow-iterations.md)。本任务没有执行推送、发布或任何现存实例升级。
