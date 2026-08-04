# AI 工作台自动化设计

## 目标与现状

AI 工作台不再把 Workflow 输入理解为“由 Agent 提供的一段 JSON”。Agent 是执行者，输入可以来自管理员手选、资源页批量操作、Cron 动态查询，后续也可以来自站内事件和受控外部连接器。所有来源最终进入同一 `{ "input": ... }` 协议、同一 Workflow Version 和同一 Run Scope。

首期已经实现：

- 文章、评论、媒体、运营建议、分类和标签六类结构化资源输入。
- JSON Schema 2020-12 编译、保存校验和排队校验，错误包含字段路径。
- 工作台结构化表单、带类型筛选的通用资源选择器、保存选择回显、失效资源警告、高级 JSON 回退，以及六类管理页的“交给 AI”入口。
- 确定性的 `resource_query`、运行开始时的资源快照、空集合短路和运行资源审计。
- Cron `resource_query` 重试会复用首次查询快照和目标范围；空集合成功结束且不调用 Agent。
- Workflow 编辑器提供可视化 `resource_query` 筛选器、单次上限和资源目录命中预览；高级 JSON 仅保留给复杂步骤。
- Workflow 保存时持久化筛选预览与预计命中数，运行后记录最近实际命中数，并支持空集合成功短路或失败提醒策略。
- 提供默认停用的规则化计划模板：发布后文章复盘、被举报评论复盘和缺失 Alt 媒体检查；相对时间与 Alt 缺失筛选在运行时确定性解析。
- `for_each` 支持显式逐项容错：继续处理其余资源并汇总成功/失败明细；全部资源失败时运行仍失败，历史 Workflow 默认保持遇错即停。
- Workflow 派生 Agent Run 的严格资源范围，以及显式授权、只读的动态发现。
- 严格范围集成测试：目标读取与提案允许、越界读取拒绝、发现资源仅可读取且未授权发现结果会被过滤。
- 媒体、运营建议、分类和单条评论所需的只读 Tool；所有写操作继续进入现有审批链路。
- 资源型 starter 修复迁移：在 Provider 晚于初始迁移配置时补齐 Skill Version、Agent 及分类/标签、混合复盘模板；不覆盖已配置的 Agent 或 Workflow。
- 运行中心已完成：统一交互任务、运行事件、图片候选生成/预览/选择/重试/应用和文章版本审计均关联 Workflow Run。

## 运行中心实施进度

- [x] `058_workflow_interactions_and_image_task_links`：交互任务、运行事件和媒体候选运行关联字段。
- [x] 交互任务仓储：创建、按 Run 查询、resume token 原子解决、取消和过期拒绝。
- [x] 管理 API：Run interactions、interaction detail、resolve、cancel。
- [x] Workflow `human_interaction` 步骤暂停/恢复执行，并复用已完成步骤输出。
- [x] 图片候选选择、封面/正文位置与锚点校验、文章版本令牌冲突阻断和新版本应用 API；支持同一 Run 批量选择并一次应用多个候选。
- [x] 图片候选重生成入口、生成尝试计数及失败错误持久化；事件查询、生成/应用事件和资产应用均已接入。
- [x] Run 详情展示交互任务和媒体候选，支持选择、重生成、应用、真实预览和批量编排；待我处理提供独立聚合入口。
- [x] 待我处理提供全局 pending interaction 查询，并复用现有 Inbox 组件展示 approval/choice/input/preview_confirm。
- [x] 新流程媒体候选从媒体库/运营建议隐藏，历史 legacy 候选保留兼容展示；新候选统一回到 Run 详情。
- [x] Run 详情增加已持久化事件时间线，展示交互、生成失败和后续应用事件。
- [x] 已生成媒体候选在 Run 详情提供真实图片预览，并记录选择、生成和文章版本事件。
- [x] 运行详情支持取消 pending 人机交互任务，并保留取消状态审计。
- [x] 图片任务持久化开始/截止/取消状态，失败或取消可重试；图片任务级可恢复截止时间为 15 分钟，Provider 请求超时可配置至 1800 秒（图片 Provider 建议 900 秒）；Run 详情在生成时自动轮询并显示已等待时间、截止时间、加载状态和取消入口。
- [x] 封面与正文插图支持无副作用文章预览；版本或锚点不匹配时禁用应用并提示重新预览。
- [x] 文章应用确认、版本 token 冲突和正文锚点冲突均写入来源 Run 时间线。
- [x] Run 详情显示封面或正文插图的拟议文章预览，不只显示预览状态；支持候选勾选、位置/锚点编辑、批量预览和批量应用。
- [x] 图片时间线完整记录预览创建、重生成请求、生成开始/完成/失败/超时/取消、选择、应用和冲突；超时保留独立错误码与可重试失败状态。
- [x] 图片 Brief 批准后自动启动来源 Run 的图片生成，并跳转至该 Run；历史 `brief_ready` 候选仍可在 Run 内手动启动，不再要求回到媒体库审核。
- [x] Run 内重生成支持管理员填写自然语言调整要求；要求会持久化、写入运行事件并只作为下一轮图片生成的附加约束，不暴露内部 Prompt。

### 多候选编排

- [x] `POST /api/admin/ai-workflow-runs/:id/media-candidates/select` 按 Run 校验候选归属、状态、位置和正文锚点，并以事务写入选择集。
- [x] `POST /api/admin/ai-workflow-runs/:id/media-candidates/apply` 合并同一文章的封面与多张正文插图，执行版本令牌/锚点/媒体资产校验后只创建一个文章版本。
- [x] Run 详情提供批量选择、批量预览和批量确认应用；版本冲突或重复封面会阻断整批操作。
- [x] 后端覆盖候选归属、重复候选、正文锚点和位置校验；前端覆盖多候选勾选、批量选择和预览交互。
- [x] Workflow 软删除后允许以相同名称和模板键重建；活动 Workflow 的名称或模板冲突返回可处理的 `409`，不泄露为 `500`。
- [x] 单值枚举的模板输入会在运行表单自动注入并以只读参数展示；图片 Brief 无需管理员手写或选择 `format=image_brief`。

## 输入来源

| 来源 | 首期状态 | 解析时机 | 典型场景 |
| --- | --- | --- | --- |
| 工作台表单 | 已实现 | 排队时 | 选择文章并填写输出格式 |
| 资源页批量入口 | 已实现 | 排队时 | 评论回复草稿、媒体 Alt 检查 |
| Cron + `resource_query` | 已实现 | 运行开始时一次性解析 | 陈旧文章、低互动内容 |
| Agent 发现 Tool | 已实现 | Tool 调用成功后 | 为目标文章发现相关内链，只读扩展 |
| 站内领域事件 | 已实现基础版 | 事件入队或数据库事件触发器消费时 | 评论被举报、媒体上传、文章发布 |
| 外部连接器 | 第四阶段 | 连接器验签/抓取后 | RSS、Search Console、Sitemap |

Agent 的模型输出不是 Workflow 的可信输入来源。模型可以在已授权范围内读取资源、分析并调用 Tool，但不能自行扩大目标集合或绕过审批。

## 结构化输入契约

运行 API 保持向后兼容：

```http
POST /api/admin/ai-workflows/42/run
Content-Type: application/json

{
  "input": {
    "post_ids": [12, 27],
    "output_format": "newsletter"
  }
}
```

Workflow 使用标准 JSON Schema，并用扩展关键字描述资源字段：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["post_ids"],
  "properties": {
    "post_ids": {
      "title": "文章",
      "type": "array",
      "items": {"type": "integer"},
      "minItems": 1,
      "maxItems": 20,
      "x-gouno-resource": "post",
      "x-gouno-widget": "entity-multi-select"
    },
    "output_format": {
      "type": "string",
      "enum": ["review", "faq", "newsletter"]
    }
  }
}
```

支持的 `x-gouno-resource` 为 `post`、`comment`、`media_asset`、`operational_suggestion`、`category` 和 `tag`。数字资源使用整数 ID，标签使用名称字符串。历史 Schema 没有扩展字段时仍显示普通控件和高级 JSON 编辑器。

## Run Scope

资源型 Workflow 默认使用：

```json
{
  "mode": "strict",
  "discovery_tools": [
    "content.find_internal_links",
    "content.search_knowledge"
  ]
}
```

- 人工选择和规则查询命中的资源以 `target` 权限写入运行快照。
- 获准的发现 Tool 返回资源后，以 `read` 权限写入快照。
- `target` 可以读取，并可在 Skill 原有能力范围内成为审批提案目标。
- `read` 只能继续读取，不能成为修改提案目标。
- 未获发现授权的 `list/search` Tool 不能扩大结果；`get/audit/check/propose` Tool 在执行前校验资源类型、参数路径和访问级别。
- `discovery_tools` 必须同时存在于绑定 Skill 的 capability 中，必须是只读 Tool，不能增加写能力。
- 历史 Workflow 保持 `unscoped`，直接 Agent Run 也保持原行为；采用资源输入后可以显式切换到严格模式。

运行与审批记录不会保存文章正文、评论身份或媒体二进制。快照只含资源键、标签、状态、版本标记和最小审计元数据；源资源删除后记录仍可解释。

## 动态资源查询

`resource_query` 是模型执行前的确定性步骤：

```json
{
  "id": "select_posts",
  "type": "resource_query",
  "resource_type": "post",
  "filter": {
    "status": "published",
    "tag": "AI",
    "updated_before_days": 180
  },
  "max_items": 20
}
```

它只能位于顶层所有 `model` 和 `for_each` 之前，不能嵌套。结果经排序、去重并持久化后，可通过 `/steps/select_posts` 交给 `for_each`。单字段和单次运行均最多 100 个目标。空集合返回 `no_matching_resources`，不调用模型也不消耗 Token。

当前筛选能力：

- 文章：搜索、状态、分类、标签、发布时间、更新时间、距今未更新天数、最低阅读和低互动。
- 评论：搜索、状态、是否举报、所属文章和创建时间。
- 媒体：搜索、内容类型、是否被引用和创建时间。
- 运营建议：搜索、状态、优先级、来源类型和创建时间。
- 分类、标签：搜索和最低文章数量。

未知筛选字段、非法布尔值、负数和非 RFC3339 时间会被拒绝，不会静默忽略。

## 管理 API

资源选择目录：

```http
GET /api/admin/ai-resources/post?q=AI&status=published&page=1&page_size=20
```

编辑已有输入时可重复传递 `key`，一次解析已选资源的当前标签并报告已删除或无权访问的引用：

```http
GET /api/admin/ai-resources/post?key=12&key=999999999
```

响应只提供选择与审计所需数据：

```json
{
  "data": {
    "list": [{
      "type": "post",
      "key": "12",
      "label": "AI 工作台设计",
      "description": "...",
      "status": "published",
      "version_token": "2026-08-02T08:00:00Z",
      "metadata": {"slug": "ai-workbench", "views_count": 1200}
    }],
    "total": 1,
    "page": 1,
    "page_size": 20,
    "unavailable_keys": ["999999999"]
  }
}
```

运行资源审计：

```http
GET /api/admin/ai-workflow-runs/91/resources
```

每条记录包含 `source: manual | query | discovery` 和 `access_level: target | read`。Workflow 创建、更新和查询响应包含 `scope_policy`；Step 支持 `resource_type`、`filter` 和现有 `max_items`。OpenAPI 按向后兼容的 `1.1.0` 描述这些契约。

## 首批自动化场景

- 批量发布前审校：文章的链接、SEO、证据和修改提案。
- 站内链接优化：可发现相关文章，但只能修改原选文章。
- 内容再分发：生成社媒、Newsletter、FAQ 和图片 Brief 草稿。
- 评论回复草稿：逐条生成待审批回复，不自动发送。
- 媒体无障碍检查：Alt 文本、引用情况和优化建议，首期仅建议。
- 分类与标签整理：分析重复、孤立、过宽或过窄，首期仅建议。
- 运营建议深挖：补充证据、优先级和编辑任务提案。
- 混合内容复盘：文章、评论和运营建议的单次专题复盘。
- 陈旧文章规则审查：Cron 固定一次运行集合，再逐篇处理。

内置模板默认停用，需管理员确认 Provider、Agent、Skill、预算和审批策略后启用。

## 后续路线

### 第二阶段：规则化自动运行

已实现可视化筛选器、保存预览、预计命中、上次实际命中、空结果策略、三类默认停用的规则化计划模板、逐项部分失败汇总、按资源重试（保留原输入与动态集合快照）、失败迭代批量重试、`for_each` 有界并发和资源类型配额；后续支持外部连接器。

### 第三阶段：事件触发

已实现 `post.published`、`post.updated`、`comment.created`、`comment.reported`、`media.uploaded`、`suggestion.created` 和 `link_check.failed` 的幂等事件表、精确字段过滤、冷却检查、事件入队 API、数据库触发器、批处理窗口以及带指数退避的失败重放；Scheduler 消费未处理事件。事件不能绕过 Skill、预算、Tool 白名单、范围或审批。

### 第四阶段：外部连接器

RSS 已通过白名单 HTTPS Tool 提供受限读取，站点 Sitemap 为现有只读公开源；Webhook 已提供 HMAC SHA-256 校验、1 MiB 限制和幂等键，仍需在部署环境配置 `GOUNO_AI_WEBHOOK_SECRET`。已实现本地 Sandbox 连接器底座及 AI 工作台管理界面：凭据经现有密钥环加密、模拟 OAuth 回调、审批后 Outbox、幂等键、每连接器分钟限流、带退避的失败重试、Mock 投递审计和撤销；界面明确显示无网络投递并支持 Profile、OAuth Mock、入队、审批、投递、重试和撤销。Mock Transport 明确不含网络请求。Search Console、Newsletter 与社媒的真实适配仍需独立 OAuth/服务凭据和经确认的供应商配置；不提供任意 HTTP、任意代码或模型生成插件。

## 验收基线

- 手选文章运行后，Agent 只能读取所选文章，批准提案后仍由既有文章版本流程写入。
- 评论回复不能读取未选评论，批准后进入既有回复流程。
- Cron 查询在模型运行前固定集合，重试和审计可还原相同目标。
- 发现文章保持只读，对发现文章提出修改会被拒绝并记录 Tool Call 原因。
- 六类资源页面都能发起兼容且已启用的 Workflow，日常运行无需手写 JSON。
- 桌面和移动端结构化表单、资源选择器、已选项和运行资源记录不重叠、不溢出。

所有写入仍需人工审批；本设计不增加自动发布、删除、直接审核或绕过审批的路径。

## Workflow 草案依赖预检

规划器完善协议（`workflow-planner/v4`，后端基础层和标准场景已接入）将自然语言先解析为版本化 `WorkflowIntent`，再由服务端能力目录、确定性模板和已授权 Agent/Skill/Provider 匹配，最后编译安全 starter Workflow。AI 不再拥有指定 Agent、Skill、Provider 或 Tool 的权限。

当前后端已提供 `internal/workflowplan` 基础层：图片、社媒、Newsletter、FAQ、评论回复、SEO 审校和媒体 Alt 场景均有固定模板；“配图 Brief”固定使用 `format=image_brief` 并把完整 `/input` 传给模型；“真实生成图片”单独要求默认图片 Provider，缺失时返回 `needs_configuration`，不会降级为 social。

`DraftAutomationPlan` 在保留旧字段的同时返回 `intent`、`template` 和 `match`（`ready | needs_configuration | unsupported | ambiguous`），这些结果只作为未持久化草案和前置提示，仍需管理员在结构化编辑器中审阅、保存和 Dry-run。

“AI 生成 Workflow 草案”不会把 Workflow 当作孤立配置。创建页会先调用 `POST /api/admin/ai-automation-plans/draft`，以只读方式检查依赖链：默认写作 Provider、可复用 Skill、可复用且已启用的 Agent，以及最后的 Workflow 结构。

- 依赖齐全时，才调用既有 `/api/admin/ai-workflows/draft` 请求模型生成细化步骤，并复用已验证的 Agent/Skill。
- Provider、Skill 或 Agent 缺失时，接口返回未持久化、默认停用的 Skill/Agent/Workflow 草案和明确前置条件；不会调用模型、保存凭据、创建资源、启用 Agent 或运行 Workflow。
- 下一步的持久化体验应复用现有 Provider、Skill、Agent 完整表单，预填草案后由管理员确认 Tool 权限、预算、Provider 和启用状态，不能由 Workflow 页面静默默认这些安全字段。
- 已实现 Skill 草案预填和 Agent 草案预填入口；两个表单都强制新草案保持停用，保存前仍由服务端校验能力、Provider、Skill Version、预算和触发器。
- 已实现 Workflow `/preflight` 无副作用检查；Dry-run 和正式运行在入队前复用服务端校验输入 Schema、Agent 状态和只读 discovery 权限，缺失依赖会阻止调用 Agent 并返回明确原因。运行表单只会根据 JSON Schema 明确声明的 `default` 补充未填写值，`enum` 只定义可选范围；可视化 Schema 字段编辑器与高级 JSON 共享同一配置，可编辑并保留 `enum` 和 `default`，服务端会拒绝不符合字段 Schema 的默认值。
- Planner 已升级为 `workflow-planner/v4`：标准场景直接使用服务端模板编译；图片/封面目标固定生成 `image_brief` 审批提案，不会降级为 social；未覆盖的高级目标仍保留一次契约纠正重试。
- 已完成 Intent/模板键持久化和运行前契约检查：历史 Workflow 标记 legacy/skipped，新 Workflow 检查模板、Tool 授权、审批路径和图片 Provider。
