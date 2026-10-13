# AI 图片生成不确定结果：人工核验与受控恢复

**状态：需以最终 PR 的全量 CI/真实 PostgreSQL 验收结果为准。** 本流程不是提供商“恰好一次”执行的证明，也不是可自动重试策略。关联 Issue #338。

## 为什么不能直接取消再重试

生成操作跨越 Provider、对象存储、Media 元数据和候选状态。Provider 的超时/断连、数据库提交确认丢失及本地 `started` 审计均无法证明外部工作没有完成或计费。旧的 `CancelMediaGeneration(generating)` 后 `ClaimMediaGeneration(cancelled)` 组合允许绕过隔离；从本次起普通取消只能处理从未领取过的 `ready_to_generate` 候选（`generation_attempt=0`）。

对于 **任何历史上已领取过** 的候选（尝试号大于零），以后即使处于 `failed`、`cancelled` 或异常的 `ready_to_generate`，也不允许直接领取，除非当前尝试已存在独立审计的人工核验决策。生产上需先升级迁移和全部后端实例，旧进程仍可运行旧状态机；部署需排空旧工作进程。

## 操作前的证据检查

1. 用受保护的只读 `GET /api/admin/ai-media-generation-reconciliation?limit=50` 查询准确的 candidate ID、`generation_attempt`、`current_attempt_audit`；不能使用不相关的 `latest_audit_*` 猜测当前尝试。当前报告列出 `outcome_uncertain` 或超过截止时间的 `generating` 候选。审核人还必须核对业务候选与事故记录，不得仅凭“到期”判定外部已结束。
2. 用本地 `dispatch_id`、Provider 官方请求 ID、账号/工作空间相关证据和事件时间，在官方控制台/工单中独立确认已知响应与账单可能性。请求 ID 是排障关联，**不是幂等键**。拿不到可靠证据就保留隔离，不能填真值凑过门禁。
3. 用审计中准确的 `storage_name`、`storage_url` 查询对象存储和 Media DB；记录是否已有可复用文件、是否存在元数据或已关联候选。对象定位信息仅代表计划位置，不证明文件存在。禁止直接删除存储对象、媒体记录或猜测时间上的孤儿。
4. 将核对过程记入可查证、非敏感的事故/支持单据，留下 **12–200 字符**的纯标识 `evidence_reference`（例如 `INC-20261013-0001`）。禁止把 API Key、原始请求体、Provider 错误全文、用户隐私或机密 URL 放入引用字段。
5. 在确认此前结果不再适合复用、责任人知晓再次生成可能额外计费后，提交受控核验决策。**确认是否核查过**不等于保证 Provider 未执行、未计费；无法确认时应停止，不应冒险重复请求。

## 受控人工决策 API

新入口独立于普通取消：

```http
POST /api/admin/ai-media-candidates/123/manual-recovery
Content-Type: application/json

{
  "expected_generation_attempt": 2,
  "evidence_reference": "INC-20261013-0001",
  "verified_provider_outcome": true,
  "verified_object_storage": true,
  "acknowledged_possible_billing": true
}
```

仅 Blog 本地具备 `ManageAI` **且同时**具备 `ManageSite` 权限的人员可以操作，并继承 AAL2、近期 MFA 和敏感操作日志保护。调用者身份来自受信任的 Blog 会话，不接受自报 reviewer ID。

控制器不调用 Provider。Repository 在五秒内进行一个短事务，以 `candidate_id + generation_attempt + outcome_uncertain`（或需复核的历史 `failed/cancelled`）和未存在旧决策作为谓词，原子将任务改为 `ready_to_generate/manual_recovery_reviewed` 并插入 `ai_media_generation_recovery_decisions`。只有 `generating` 且已标记不确定、报告超期的任务可走当前生成尝试核验；普通到期但未标记不确定的在途任务不能被悄悄解除。

决策表是**独立、保留、追加写入**的事实记录：唯一 `(candidate_id,generation_attempt)`，存 reviewer、凭证引用与确认项；数据库触发器拒绝 UPDATE / DELETE / TRUNCATE。旧版本历史不补造决策，候选删除也不会级联删除这些记录。重复提交、错位尝试、并发审核人或事务提交确认丢失，不得出现第二份决策或覆盖较新的尝试；CAS 不匹配返回 409 冲突。

成功的“人工核验”**仅解除该尝试的隔离**，不会立即提交新的模型请求。审核人必须按既有权限流程，**另行主动发起**下一次生成；新一次领取的 `generation_attempt` 必须递增，旧任务结果不得挂接新尝试。

## 禁止事项、限制和验收

- 禁止因超时、缺少 provider ID、存储没有发现对象、审计状态为 started、或“看起来已经取消”而自动重试/解绑/重置租约/补发 Provider 请求/发布。
- 禁止拿 `X-Client-Request-Id`、`x-request-id`、Anthropic `request-id`、Gemini `responseId` 当幂等保证；不同供应商/端点的官方幂等能力还需要独立核验。
- 先落数据库迁移 `097_media_generation_reviewed_recovery.sql`，再整体升级工作进程；混合版本期间旧代码不具备本次守卫。手动审计无法把 PostgreSQL 与 Provider/对象存储做成原子事务。
- 既有 API 运行中的请求应在升级前自然排空；不可通过一次 SQL 把 `generating` 改成 `failed` 或删除历史审计。
- 通过测试须证明确认前零重放、只有一个审核事务可以成功、历史 `failed/cancelled` 不能绕过、旧 worker 的 CAS 写入失败、提交确认丢失不造成决策重放、数据库决策不可修改/删除；真实 PostgreSQL 集成用例不允许跳过。
