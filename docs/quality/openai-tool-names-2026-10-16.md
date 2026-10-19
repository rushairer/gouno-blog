# OpenAI 工具名兼容性复查：2026-10-16

## 生产证据

北京时间 2026-10-16 16:38:24，Workflow Run 58 在 `write_article` 步骤失败，关联 Agent Run 73。检查时后端 OCI revision 为 `74e5479480e0ed636637a6916421cab97d9b1ae7`，容器创建于当天 16:25:43。

Agent 的持久化错误明确为 `/v1/responses streaming fallback (stream=true) failed`，最终上游 HTTP 400 原因为 `Invalid 'tools[0].name'`，要求名称匹配 `^[a-zA-Z0-9_-]+$`。因此本次并非历史 Run，也不是没有发送 `stream:true`：流式协商后的实际失败现在已经被正确保留。

`ManagementService.TestProvider` 只发送 `Return exactly OK.` 和 `health check`，不携带工具；连接测试成功不能证明 Agent 工具调用载荷合法。OpenAI 两种文本协议此前直接发送内部 `content.list_posts` 一类含点工具名，而 Anthropic 已有独立名称转换。

## 修复范围

只在 OpenAI 文本适配器边界转换名称。合法且不超过 64 字节的名称保持不变；其他名称使用合法字符前缀和确定性的 SHA-256 摘要后缀构造别名。检测同请求中的别名冲突并在 HTTP 请求前失败，而不是误派发另一工具。

工具定义、强制工具选择和历史 assistant 工具调用使用同一映射；JSON/SSE 返回的工具调用精确映射回内部名称。未登记的返回名称保持原样，交给现有 Agent 授权及工具注册边界处理，不猜测下划线对应的内部命名空间。复制请求切片，不修改调用方的工具和历史记录。

不修改数据库能力名、权限、Connector、图片生成、重试策略或线上私有 AI 路由。不通过删除工具或切换 Provider 绕过失败。

## 验证边界

HTTP 回归先在未接入映射的实现上复现六种组合失败：Responses/Chat Completions × never/always/auto，服务端收到原始含点名称并拒绝。回归验证映射后定义、强制选择、历史一致，JSON/SSE 名称还原，auto 两次协商的映射稳定以及请求计数；另验证长度、Unicode、相似名称和别名冲突。

## 为什么错误看起来与原因不一致

1. 旧实现会在流式第二请求失败后返回第一请求的 `Stream must be set to true`。这是真实的错误覆盖缺陷，已由 `74e547948` 修复。Run 58 的错误已包含流式第二请求返回的工具名错误，不应再解释为未开启 Stream。
2. 最新 Provider 错误的开头仍为 `streaming fallback ... failed`，其含义是“在流式协商后的请求阶段失败”，不是根因分类。本次将最终上游错误放在前面，再附带 `stream=true` 阶段信息，保留 typed cause、request evidence 和重试边界。
3. Workflow 将任何 Agent 执行失败包装为 `invalid workflow`，丢弃了可见摘要中的真实原因。现在移除这个错误分类，持久化可机读的 Provider 失败代码，并在 Workflow 步骤、运行摘要和通知中使用固定、脱敏的原因摘要。通过 typed HTTP/transport cause 分类，不从任意错误字符串猜测；不把上游原始 body、prompt、凭据或私有地址复制到这些摘要。

已知分类包括工具名不合法、请求参数、鉴权、端点不兼容、限流、上游服务错误、超时及明确的 Stream 配置/网关冲突。其他 Agent 错误和旧记录明确指向对应 Agent Run 详情，不虚构根因，也不改写历史失败。

连接测试仍是无工具的轻量请求，并非工作流端到端验收。本次不自动增加计费工具/图片调用，不重跑或发布失败任务。

## 本地验证

- Backend 全包测试与 race 检测、`go vet ./...`、`go mod verify` 通过。
- 运行仓库自带的一次性 PostgreSQL 门禁，21 个含集成测试的包全部通过，必需测试无失败、跳过或缺失；测试容器已清理，未连接线上数据库执行测试。
- Provider 工具名回归覆盖两种协议、三种 Stream 模式、强制选择、assistant 历史、返回名称还原、别名冲突及零 HTTP 派发。
- 新增 typed 失败分类回归、真实 HTTP 两次 Stream 协商到 Agent 失败诊断的回归，以及 Workflow 步骤/运行摘要一致性、取消/旧记录和脱敏回归。未知错误文本不会冒充已知 Provider 分类。

## 提交与上线边界

本次按用户要求提交推送到 `main`，沿用既有开发环境 `main` 镜像流水线，不修改镜像标签、Compose 或服务器配置。推送、镜像构建及运行中容器更新是三个独立步骤；后续上线须核对实际 revision/digest 并新建 Run。文章生成、封面生成和发布各步骤仍需分别验证。
