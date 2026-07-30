# Gouno Blog AI Agent 模块开发计划

## 1. 产品目标

将 Gouno Blog 从“带 AI 写作功能的博客”升级为“由受控 Agent 参与运营的 AI Blog 系统”。

首版目标不是让模型完全自治，而是建立一套可持续扩展的 Agent 基础设施：

- 管理员可以创建 Agent，选择 Provider、模型、执行周期和能力。
- Agent 可以读取博客数据并调用经过授权的 Blog Tools。
- Agent 的每次运行、模型调用、工具调用和费用都有记录。
- 读操作可以自动执行，写操作默认生成提案并进入审批。
- 首版交付三个具有实际运营价值的预置 Agent。

首版不包含多 Agent 协作、向量数据库、自动发布、自动删除及任意网络访问。

## 2. 现状与复用结论

### 2.1 `gouno-agent-demo` 可复用部分

可以迁入 `blog-backend` 并改造：

- `internal/provider`：OpenAI Responses API、Anthropic Messages API、同步和 SSE 解析。
- Provider 公网 HTTPS 自动准入、私网主机显式白名单、DNS/IP 复核、禁止重定向、密钥只从环境变量读取。
- 请求超时、输入长度限制、未知 JSON 字段拒绝。
- `internal/billing.UsageRecorder` 抽象和 token 用量采集思路。
- Request ID、安全日志和健康检查模式。
- Provider 和 Agent Service 之间的接口隔离。

不能直接照搬：

- demo 只有一个静态 `default_provider`，Blog 需要每个 Agent 独立选择 Provider Profile 和模型。
- demo 是单轮文本生成，没有工具调用、运行状态、任务调度和数据库持久化。
- demo 的 FAQ fail-closed 检索是 IT 服务台专用，需要替换为 Blog 工具权限和运行时策略。
- demo 的字符串式提示词攻击检测只能作为补充，不能作为 Agent 安全边界。
- demo 的 usage 仅写日志，Blog 需要持久化用量和预算统计。

### 2.2 `gouno-blog` 已具备的基础

- Go/Gin 后端和 PostgreSQL migration 机制。
- GOSSO/OIDC 管理员身份认证。
- 文章草稿、定时发布和最多 50 个版本快照。
- 评论审核、举报、标签、媒体库和 Analytics。
- React 管理后台和统一 `apiFetch` 鉴权。
- 后端已经存在随进程启动的定时发布任务，可作为首版 Agent Scheduler 的实现参考。

## 3. 总体架构

首版将 Agent 模块集成在 `blog-backend`，不单独部署 Agent 微服务。

```text
React Admin
    |
    v
Agent Admin API
    |
    +--> Agent Service ----> Provider Registry ----> OpenAI / Anthropic
    |          |
    |          +--> Tool Registry ----> Post / Community / Growth Services
    |          |
    |          +--> Approval Service
    |
    +--> Scheduler / Worker
               |
               +--> PostgreSQL Agent Runs / Tool Calls / Usage
```

这样可以直接复用现有领域 Service 和事务能力，避免 Agent 通过内部 HTTP 绕过业务校验。后续运行量增大时，可以把 Scheduler/Worker 拆为独立进程，但继续使用同一套 repository 和 service。

### 3.1 推荐目录

```text
blog-backend/internal/
  agent/
    service.go
    runner.go
    prompt.go
    policy.go
  provider/
    provider.go
    registry.go
    openai.go
    anthropic.go
    http.go
  tool/
    registry.go
    schema.go
    content_tools.go
    comment_tools.go
    analytics_tools.go
  approval/
    service.go
  repository/
    agent_repository.go
  controller/
    agent_controller.go
  task/
    agent_scheduler.go
  usage/
    recorder.go
```

前端新增：

```text
blog-frontend/src/pages/
  Agents.tsx
  AgentEditor.tsx
  AgentRuns.tsx
  AgentApprovals.tsx
```

## 4. 核心领域模型

### 4.1 Provider Profile

Provider 和 Agent 都是 Blog 后台的一等管理资源，必须有 UI、管理 API 和数据库持久化。管理员可以在 UI 中录入 Provider API Key，但数据库只能保存加密后的密文，不能保存明文。

服务端使用部署环境提供的 `BLOG_AGENT_MASTER_KEY` 做信封加密（建议 AES-256-GCM），并记录密钥版本以支持轮换。API Key 只在 Provider 调用前于内存中解密；查询接口永远不返回明文，只返回 `has_api_key` 和掩码尾号。应用日志、Agent Run、Tool Call 和错误信息均不得包含密钥。

关键字段：

- `id`, `name`, `provider_type`
- `base_url`, `model`
- `api_key_ciphertext`, `api_key_nonce`, `key_version`, `api_key_last4`
- `enabled`
- `request_timeout_seconds`
- `max_output_tokens`
- `created_at`, `updated_at`

Provider Profile 只能由管理员管理。公网 HTTPS `base_url` 在 DNS/IP 安全校验通过后自动准入；私网或回环 Provider 必须位于服务端允许列表，Agent 运行时不能覆盖。编辑 Provider 时，API Key 留空表示保留现有密钥；只有显式提交新 Key 才替换密文。

### 4.2 Agent

关键字段：

- `id`, `name`, `description`
- `system_prompt`
- `provider_profile_id`
- `enabled`
- `trigger_type`: `manual | cron`
- `cron_expression`, `timezone`
- `capabilities`: JSONB 字符串数组
- `execution_mode`: `advisory | approval`
- `max_steps`, `max_input_tokens`, `max_output_tokens`
- `daily_run_limit`, `monthly_token_budget`
- `last_run_at`, `next_run_at`
- `created_by`, `created_at`, `updated_at`

首版时区固定支持 IANA timezone，默认 `Asia/Shanghai`。Cron 表达式在保存时验证。

### 4.3 Agent Run

关键字段：

- `id`, `agent_id`, `trigger_type`, `triggered_by`
- `status`: `queued | running | awaiting_approval | succeeded | failed | cancelled`
- `started_at`, `finished_at`
- `input`, `output_summary`
- `provider`, `model`
- `input_tokens`, `output_tokens`
- `error_code`, `error_message`
- `created_at`

`input` 与输出正文可能包含博客内容，应设长度上限；日志系统仍只记录元数据，不把正文输出到应用日志。

### 4.4 Tool Call

关键字段：

- `id`, `run_id`, `tool_name`
- `risk_level`: `read | propose | write`
- `arguments`, `result`
- `status`: `requested | executed | rejected | failed`
- `approval_id`
- `started_at`, `finished_at`

### 4.5 Approval

关键字段：

- `id`, `run_id`, `tool_call_id`
- `action_type`, `target_type`, `target_id`
- `proposed_payload`
- `before_snapshot`
- `status`: `pending | approved | rejected | expired | executed | failed`
- `reviewed_by`, `review_note`, `reviewed_at`
- `created_at`, `expires_at`

审批执行必须再次校验目标当前状态。若目标在提案后已被人工修改，应返回冲突，不能覆盖新内容。

## 5. Tool 设计

Tool 是 Agent 唯一能够接触 Blog 后台的方式。每个 Tool 必须声明参数 Schema、输出 Schema、风险等级、超时和最大结果数。

### 5.1 MVP 只读工具

| Tool | 用途 | 限制 |
| --- | --- | --- |
| `content.list_posts` | 查询文章、状态、标签和时间 | 最大 100 条 |
| `content.get_post` | 读取单篇文章 | 按 ID，正文限制长度 |
| `content.search_posts` | 标题、摘要、正文搜索 | 最大 20 条 |
| `content.list_tags` | 获取标签 | 只读 |
| `comments.list_pending` | 获取待审核/被举报评论 | 默认隐去用户身份字段 |
| `analytics.get_summary` | 获取现有 Analytics 汇总 | 限定时间范围 |
| `content.check_links` | 检查文章 Markdown 链接 | 只允许 HTTP(S)，需 SSRF 防护 |

### 5.2 MVP 提案工具

| Tool | 产生的审批动作 |
| --- | --- |
| `content.propose_draft` | 新建文章草稿 |
| `content.propose_update` | 修改现有文章草稿或已发布文章 |
| `content.propose_tags` | 更新标签 |
| `comments.propose_reply` | 创建回复草稿；首版不直接对外发送 |
| `content.propose_task` | 创建运营建议/待办 |

首版模型不直接调用现有 `UpdatePost` 或评论发布 Service。它只创建 Approval；管理员批准后，由 Approval Service 调用现有领域 Service 执行，因此文章版本快照仍然生效。

### 5.3 后续高风险工具

以下能力不进入 MVP：

- 直接发布或下架文章。
- 自动批准、隐藏或删除评论。
- 删除文章或媒体。
- 修改站点设置、权限和导航。
- 任意 HTTP 请求和任意代码执行。

## 6. Agent 执行协议

建议将 demo 的纯文本 `Generate` 接口升级为结构化 Agent Turn：

```go
type Request struct {
    Instructions string
    Messages     []Message
    Tools        []ToolDefinition
    MaxTokens    int
}

type Result struct {
    Text         string
    ToolCalls    []ToolCall
    InputTokens  int
    OutputTokens int
    StopReason   string
}
```

Runner 的执行流程：

1. 创建 `agent_run`，加载 Agent 和 Provider Profile 快照。
2. 校验启用状态、运行次数、token 预算、最大并发和能力列表。
3. 生成固定平台提示词，再追加管理员配置的 Agent prompt；平台规则优先级不可被覆盖。
4. 将该 Agent 获准的 Tool Schema 传给 Provider。
5. 模型提出 Tool Call，Runner 对名称、参数、权限和风险再次校验。
6. 只读 Tool 立即执行；提案 Tool 创建 Approval；未授权 Tool 直接拒绝。
7. 将 Tool 结果反馈模型，最多执行 `max_steps` 轮。
8. 持久化最终摘要、Tool Calls 和 token 使用量。
9. 运行进入 `succeeded` 或 `awaiting_approval`。

必须设置：

- 单次运行最大步数，建议默认 6。
- 单 Agent 同时最多一个运行。
- 单 Tool 结果大小限制。
- 上游总超时和每个 Tool 超时。
- Agent 停用后不再调度，但保留历史。
- 相同调度窗口的幂等键，防止多实例重复执行。

## 7. 管理 API

全部放在现有 Admin OIDC/RBAC 路由下：

```text
GET    /api/admin/provider-profiles
POST   /api/admin/provider-profiles
PUT    /api/admin/provider-profiles/:id
DELETE /api/admin/provider-profiles/:id
POST   /api/admin/provider-profiles/:id/test

GET    /api/admin/agents
POST   /api/admin/agents
GET    /api/admin/agents/:id
PUT    /api/admin/agents/:id
DELETE /api/admin/agents/:id
POST   /api/admin/agents/:id/run
POST   /api/admin/agents/:id/enable
POST   /api/admin/agents/:id/disable

GET    /api/admin/agent-runs
GET    /api/admin/agent-runs/:id
GET    /api/admin/agent-runs/:id/tool-calls

GET    /api/admin/agent-approvals
POST   /api/admin/agent-approvals/:id/approve
POST   /api/admin/agent-approvals/:id/reject
```

删除 Agent 建议采用软删除或“存在运行历史时禁止物理删除”。

## 8. 管理后台体验

### Agent 列表

- 状态、Provider/模型、触发周期、能力、最近运行和下次运行。
- 启停、立即运行、查看历史。
- 运行中的 Agent 显示状态，防止重复点击。

### Agent 编辑器

- 基本信息和系统指令。
- Provider Profile 与模型参数。
- Cron 表达式、时区和下一次运行预览。
- 能力分组勾选，并清晰标注只读/需审批/高风险。
- 运行限制和预算。
- 保存前配置验证。

### Provider 管理

- Provider 名称、类型、Base URL、模型、超时和最大输出 token。
- API Key 使用密码输入框，保存后仅显示掩码；编辑时留空表示不更换。
- 保存前校验公网/私网策略、DNS 解析、HTTPS 和模型字段。
- “测试连接”只返回成功、延迟和标准化错误，不回显上游原始敏感响应。
- 已被 Agent 使用的 Provider 不允许删除，只能停用或先迁移 Agent。

### 运行中心

- 按 Agent、状态、时间筛选。
- 时间线展示：模型思考摘要、工具调用、审批、最终结果。
- 展示 token 用量、耗时和错误码。
- 不展示 Provider 密钥，不默认暴露完整平台提示词。

### 审批箱

- 展示变更摘要和 before/after diff。
- 批准、拒绝和备注。
- 对文章修改使用 Markdown diff。
- 冲突和过期提案不能批准执行。

## 9. 预置 Agent

### 9.1 每周运营报告

- 周一上午运行。
- 能力：文章列表、Analytics、评论汇总。
- 输出：过去 7 天表现、增长/下滑内容、待处理评论、下周建议。
- 全程只读，无需审批。

### 9.2 内容健康巡检

- 每周运行。
- 能力：文章读取、搜索、标签、链接检查、文章更新提案。
- 输出：死链、过期内容信号、缺失摘要、标签问题和修改提案。
- 所有修改进入审批。

### 9.3 评论洞察与回复草稿

- 每日运行。
- 能力：待审评论、文章读取、回复提案。
- 输出：垃圾/问题/建议分类、高频问题、回复草稿。
- 不自动审核评论，不直接回复。

预置 Agent 以 seed 数据创建，管理员可以复制和修改，避免硬编码在 Runner 中。

## 10. 分阶段实施

### 阶段 0：技术基线与契约（已完成）

- 确认 Agent 状态机、Tool 风险等级和审批规则。
- 设计 migration 和 OpenAPI 契约。
- 确认 Provider Profile 的加密落库、主密钥轮换和允许主机配置。
- 为 Provider/Agent/Tool 接口建立 fake，保持单元测试可离线运行。

验收：领域模型、数据库草图和 API 契约评审通过。

### 阶段 1：Provider 层迁移（已完成）

- 从 demo 迁入 Provider HTTP 安全实现和 OpenAI/Anthropic 适配器。
- 将接口升级为 messages、tool definitions、tool calls 和 usage。
- 增加 Provider Registry，按 Agent 选择 Profile。
- 增加 Provider 连接测试、超时、错误归一化和健康检查。

验收：两个 Provider 均可完成普通文本和结构化 Tool Call；测试不依赖真实密钥。

### 阶段 2：持久化与管理 API（已完成）

- 新增 Provider Profile、Agent、Run、Tool Call、Approval、Usage migrations。
- 实现 API Key 加密写入、内存解密、掩码读取和密钥版本字段。
- 实现 repository/service/controller。
- 实现 Agent CRUD、启停、立即运行、运行历史和审批 API。
- 更新 OpenAPI。

验收：管理员可通过 UI/API 完整配置 Provider 和 Agent；非管理员无法访问；敏感密钥不以明文进入 API 响应、数据库或日志。

### 阶段 3：Tool Runtime 与 Runner（已完成）

- 实现 Tool Registry、Schema 校验、能力授权和结果裁剪。
- 接入首批只读 Tool。
- 实现提案 Tool 和 Approval Service。
- 实现 Runner 状态机、最大步骤、预算、超时、并发锁和错误分类。
- 持久化用量，按 Agent 汇总。

验收：未授权工具无法执行；所有写操作只能形成审批；批准后通过现有 Blog Service 执行并产生文章版本。

### 阶段 4：Scheduler（已完成）

- 使用成熟 Cron 库解析表达式。
- 计算和持久化 `next_run_at`。
- 用 PostgreSQL advisory lock 或任务 claim 防止多实例重复执行。
- 加入错过任务策略、重试退避和优雅停机。

验收：相同调度窗口只执行一次；失败可追踪；停用 Agent 不再触发。

### 阶段 5：React 管理后台（已完成）

- Agent 列表与编辑器。
- Provider Profile 管理和连接测试。
- 运行中心与 Tool Call 时间线。
- 审批箱及文章 Markdown diff。
- 中英文 i18n、空状态、错误态和前端测试。

验收：管理员无需修改 YAML 即可完成 Agent 创建、试运行、查看结果和批准提案。

### 阶段 6：预置 Agent、可观测性与加固（已完成）

- Seed 三个预置 Agent。
- 运行指标、结构化元数据日志和告警点。
- Prompt injection 场景、SSRF、越权、超限、重复调度、审批冲突测试。
- 更新 README、部署环境变量和运维说明。

验收：三个预置 Agent 在本地完整集群中端到端运行；安全测试和回归测试通过。

预计总工作量：19–26 人日。若先只做“手动运行 + 只读报告”，可在约 8–12 人日交付一个可演示版本；Cron、审批和完整后台随后补齐。

## 11. 测试策略

### 后端

- Provider fixture 测试：OpenAI/Anthropic 普通响应、流式响应、Tool Call 和错误响应。
- Provider Secret 测试：密文随机 nonce、掩码读取、留空不替换、错误主密钥无法解密、日志不泄露。
- Agent Service 单元测试：预算、权限、最大步骤、非法 Tool、输出为空。
- Tool 单元测试：参数 Schema、查询上限、字段脱敏。
- Repository 集成测试：运行状态转换、幂等调度、审批冲突。
- Controller 测试：RBAC、未知字段、分页、错误码。
- 安全测试：恶意 URL、重定向、内网 IP、提示词要求越权、超大正文。

### 前端

- Agent CRUD、表单验证、立即运行。
- 运行状态轮询与错误展示。
- 审批 diff、批准/拒绝和冲突。
- 权限不足与登录跳转。

### 端到端

- 创建 Agent → 手动运行 → 读取文章 → 产生提案 → 管理员批准 → 文章生成新版本。
- Cron 到期 → 单次 claim → 运行记录和 usage 入库。
- Provider 不可用 → 运行失败 → 不产生任何 Blog 写入。

## 12. 发布与回滚

- 使用功能开关 `GOUNO_AI_AGENTS_ENABLED`，生产配置默认关闭；本地 Compose 默认开启。
- 生产环境启用 Agent 时强制要求 `BLOG_AGENT_MASTER_KEY`，缺失或长度不合格则启动失败。
- migration 只新增表和索引，不修改现有文章/评论表的核心语义。
- 首次上线只开放管理员手动运行和只读能力。
- 第二阶段打开 Cron 和提案审批。
- 自动发布等高风险能力必须在独立版本中设计，不能通过数据库手工添加 capability 绕过。
- Agent 导致的文章修改复用现有 `post_versions` 回滚能力；审批记录保留 before snapshot。

## 13. MVP 完成定义

满足以下条件才算 Agent MVP 完成：

- 管理员可以配置至少 OpenAI、Anthropic 两类 Provider Profile。
- 管理员可以创建、启停、手动运行和定时运行 Agent。
- Agent 的能力由白名单控制，未授权 Tool 无法执行。
- 所有 Blog 写操作均进入审批，没有模型直接发布/删除路径。
- 每次运行有状态、耗时、Tool Call、token 用量和错误记录。
- 三个预置模板可在本地 Compose 中选择 Provider 后创建并运行；真实模型调用需要管理员配置自己的 Provider API Key。
- Provider 密钥只加密入库，不以明文回传或写日志，并支持主密钥版本轮换。
- 重复调度、越权、SSRF 和审批冲突具备自动化测试。

## 14. MVP 后演进计划（2026 H2）

MVP 已完成后，不引入可执行第三方代码式插件市场。后续能力以 **受控 Tool → 可保存 Skill/Workflow → 经验证的原生能力** 的路径演进：模型负责理解和编排，核心服务继续负责数据一致性、权限、渲染与高频确定性任务。

### 阶段 7：内容智能基础（已完成）

目标：让 Agent 能在不增加写权限的前提下，对草稿、定时文章和已发布文章提供可靠的编辑质量反馈。

- [x] 修复 Admin Tool 对草稿/定时文章的读取、链接检查和提案审批链路；公开读取仍只返回已发布文章。
- [x] 新增 `content.audit_post` 只读 Tool，输出确定性检查项：标题/摘要/SEO 元数据长度、Markdown 标题层级、字数、图片 alt、内部链接与外链数量。
- [x] 新增“发布前内容检查”手动预置 Agent，仅允许 `content.get_post`、`content.audit_post`、`content.search_posts` 和 `content.propose_update`。
- [x] 在运行中心显示检查项和证据；AI 只能基于检查结果提出修改，不能直接发布。

验收：草稿可被完整检查并形成可审批的更新提案；公开 API 仍无法读取草稿；确定性检查不依赖模型即可单测。

### 阶段 8：站点知识与引用式创作（已完成）

目标：提供站点级上下文，而不是孤立的“写作按钮”。

- [x] 建立 PostgreSQL 生成式全文检索索引，索引随文章写入自动更新且不进入访客页面请求链路。
- [x] 为已授权文章建立异步、可重建的分段语义检索索引；索引失败不得阻塞页面访问或发布。
- [x] 新增 `content.find_internal_links` 基线 Tool：以共享标签、标题/关键词匹配为可解释依据，排除已有链接，只返回已发布文章；运行中心显示候选文章、匹配分和依据。
- [x] 新增词法 `content.find_related` Tool，返回已发布文章、相关片段和全文检索相关度；运行中心可直接审阅并跳转结果。语义排序与分段来源位置仍待后续索引实现。
- [x] 将 Agent 输出中的站内依据结构化为 citations；界面可跳转原文，并明确标出无来源的建议。
- [x] 增加索引任务队列、版本/删除同步、租户与权限隔离，以及检索质量离线评测集。

验收：编辑 Agent 能为长文给出可点击的内链和来源；无权限/已删除内容永不出现在结果中；P95 检索延迟和索引积压均有监控。

### 阶段 9：Skill 与确定性 Workflow（已完成）

目标：把反复成功的 Agent 操作沉淀为可治理、可复用的“无代码插件”。

- [x] 增加 versioned Skill 持久化模型与管理员 CRUD API：允许的 Tool、固定指令、预算和审批模式均受既有白名单校验；Skill 不包含 Provider 密钥或可执行代码。
- [x] 管理台可创建、编辑和审阅 Skill；创建/编辑 Agent 时可应用 Skill，以受保存时校验的指令、能力、执行模式与预算填充表单。Provider 与触发器仍由 Agent 单独配置。
- [x] 增加输入 schema 与触发器定义。
- [x] 支持保存 Agent 运行配置为私有 Skill、从内置模板创建、导入/导出 JSON；首版不开放任意公网市场安装。
- [x] 将发布前检查、周报、旧文刷新做成可重复执行的 Workflow；模型调用只位于需要判断的节点，数据搬运和通知使用确定性节点。
- [x] 增加 Skill 版本锁定、dry-run、执行 diff、回滚/停用和按 Skill 的成本、失败率统计。

验收：一次 Workflow 运行可完整复现输入、版本、Tool 调用和审批结果；升级 Skill 不会改变历史运行语义。

### 阶段 10：运营闭环与主动建议（已完成）

目标：从“等待提问”升级到管理员可控制的运营提醒。

- [x] 新增 `content.list_stale_posts`，以文章更新时间识别长期未更新的已发布内容；内容健康 Agent 可据此创建审批提案，运行中心显示更新时间与互动数据。
- [x] 新增 `content.list_orphan_posts`，以已发布文章中的相对站内链接识别零入链候选；Tool 同时返回匹配规则，运行中心可审阅候选，避免把启发式结果当作绝对事实。
- [x] 新增 `analytics.list_low_engagement_posts`，仅使用文章聚合浏览与点赞计数识别高浏览低互动候选，默认阈值为至少 100 浏览且点赞率不超过 2%。
- [x] 以聚合指标识别失效链接和标签膨胀。
- [x] 创建站内运营任务/通知提案，默认不发送外部消息；支持摘要周报和优先级排序。
- [x] 对标题、摘要和封面文案支持受控 A/B 候选及人工选择；指标读取只使用脱敏聚合数据。
- [x] 引入反馈标签（采纳/拒绝/无效），形成提示词、Skill 和规则的离线改进依据。

验收：每条主动建议有数据证据、来源时间窗口和一键忽略；不会访问原始访客身份或行为明细。

### 阶段 11：外部分发与多模态（独立安全评审后，3–5 周）

目标：在审批边界内支持内容再利用和媒体资产生产。

- 先生成社媒/newsletter/FAQ 草稿和图片 brief；外部发布始终单独审批。
- 媒体生成结果进入媒体库候选区，带来源、模型、成本、版权/安全检查状态和 alt 文本提案。
- 每个外部连接器使用独立 OAuth 凭据、最小 scope、撤销能力、限流和投递审计。

验收：连接器故障、重复投递和审批过期均不会导致重复发布；资产与外部发布都可追踪和撤销。

### 横向工程门槛

每一阶段合入 `main` 前必须满足：

- 所有新增 Tool 都具备 schema、风险等级、能力白名单、输入/输出大小限制和单元测试。
- 任何写入都复用领域 Service，并保留审批、版本或可回滚记录；没有“模型直写数据库”路径。
- AI 和索引任务均在异步 worker 执行，不进入访客页面渲染关键路径。
- 每次发布记录模型、Skill/Workflow 版本、耗时、token、Tool 成功率和错误分类；密钥、正文和身份信息不进入应用日志。
- 先以 feature flag 灰度到管理员手动执行，再开放 Cron；达到成本、失败率和越权测试门槛后才扩大范围。

### 优先级与决策原则

| 优先级 | 投入方向 | 原因 |
| --- | --- | --- |
| P0 | 草稿检查、站内检索、审批与运行可靠性 | 直接改善写作和运营，并保持风险可控。 |
| P1 | Skill/Workflow、运营洞察 | 将高频成功流程产品化，逐步替代轻量插件需求。 |
| P2 | 外部分发、多模态、社区共享模板 | 外部副作用、成本和版权边界更大，需在 P0/P1 数据稳定后推进。 |

不做的事情：不在主题渲染或公开页面请求中调用模型；不执行 Agent 生成的代码；不允许任意 HTTP Tool；不让 Skill 通过配置绕过审批、RBAC 或 Tool 白名单。
