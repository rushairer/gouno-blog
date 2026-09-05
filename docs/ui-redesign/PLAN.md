# Gouno 产品家族 UI 重构执行计划

## 工作方式

本计划采用 `docs/quality` 同款的“路线图 → 任务卡 → 阶段复核”方式执行。每张任务卡对应一个新会话；阶段不是一次性大提示词，而是一组有前置关系、结果记录和独立验收条件的小任务。每个新任务开始时必须先阅读：

1. 根目录 `AGENTS.md`；
2. 本文件；
3. `docs/ui-redesign/migration.json` 和 `MIGRATION.md`；
4. 当前仓库与相关仓库的 `git status`。

质量任务卡位于 `docs/ui-redesign/tasks/`，索引和推荐顺序见 `docs/ui-redesign/tasks/README.md`。旧版 `PHASE-PROMPTS.md` 保留为复制入口，但以后应优先复制任务卡中的提示词。

阶段完成必须更新清单、记录验证证据，并让工作区保持可审查。新会话只处理提示词指定的阶段，不顺手扩大范围。

## 阶段总览

| 阶段 | 目标 | 主要仓库 | 完成门槛 |
| --- | --- | --- | --- |
| 0 | 基线、入口和依赖盘点 | 两仓库 | 路由/子视图/状态清单可追溯，质量基线有日志 |
| 1 | 共享包与设计系统定版 | gouno-blog | `@gouno/ui` 可独立安装、构建、测试、展示；双品牌双模式通过 |
| 2 | Blog 公共发现与阅读 | gouno-blog | 首页、发现、阅读、账户公共状态迁移并完成组件/路由回归 |
| 3 | Blog Admin 外壳与内容管理 | gouno-blog | Dashboard、Posts、Pages、Taxonomy、Comments、Media、Settings 全量接入 |
| 4 | AI 工作台与 Connector 展示迁移 | gouno-blog | 所有 AI 子视图和 Connector 展示层迁移；Connector 行为契约不变 |
| 5 | gosso-admin 认证与账户 | gosso-admin | 登录、回调、找回/重置、账户设置、MFA、Passkey、会话回归 |
| 6 | gosso-admin 系统管理 | gosso-admin | Clients、Users、Audit、Site Settings、System 全量迁移 |
| 7 | 双仓库消费、分发与构建 | 两仓库 | 精确归档、integrity、独立检出、Docker/双路径构建通过 |
| 8 | 浏览器 QA、无障碍、清理与交付 | 两仓库 | 代表截图、响应式/主题/权限/错误分支证据齐全，旧 UI 清理完成 |

## 阶段 0 之后的任务拆分

阶段 0 已完成盘点，后续从以下任务开始：

| 任务 | 目标 | 前置 | 状态 |
| --- | --- | --- | --- |
| U01a | 修复/解释 Blog branch coverage 阻断 | 阶段 0 | planned |
| U01b | 修正 gosso-admin 测试 URL 的标准 HTTPS 端口契约 | 阶段 0 | planned |
| U01c | 共享包安装、展示和三品牌主题验收 | U01a、U01b | planned |
| U01d | 共享包阶段独立复核 | U01c | verified |
| U02a | Blog 公共 Shell 与发现页 | U01d | planned |
| U02b | Blog 阅读页与公共状态 | U02a | planned |
| U02c | Blog 公共页面阶段复核 | U02b | planned |
| U03a | Blog Admin Shell、Dashboard 与列表模板 | U02c | planned |
| U03b | Posts/Pages 编辑器与草稿发布流程 | U03a | planned |
| U03c | Taxonomy、Comments、Notifications、Media、Settings | U03a | planned |
| U03d | Blog Admin 内容阶段复核 | U03b、U03c | planned |
| U04a | AI 工作台视图迁移 | U03d | planned |
| U04b | Connector 展示层迁移 | U04a | planned |
| U04c | AI/Connector 阶段复核 | U04a、U04b | planned |
| U05a | gosso-admin 认证与账户 | U01d | planned |
| U05b | gosso-admin 认证阶段复核 | U05a | planned |
| U06a | gosso-admin 系统管理 | U05b | planned |
| U06b | gosso-admin 管理阶段复核 | U06a | planned |
| U07a | 双仓库分发、lockfile 和 Docker 构建 | U04c、U06b | planned |
| U07b | 集成阶段复核 | U07a | planned |
| U08a | 浏览器响应式、主题、权限和无障碍 QA | U07b | planned |
| U08b | 旧 UI 清理、证据汇总和最终验收 | U08a | planned |

## 阶段规则

- 不降低测试覆盖率门槛，不删除测试来获得绿色结果。
- 不修改后端接口、认证安全机制、数据库或会话语义。
- Connector 只改展示层，除非提示词明确授权，不改 OAuth、凭证、Sandbox、Outbox 和投递状态转换。
- 每阶段优先使用现有共享组件；新增组件先进入 `packages/ui`，不得在消费者中复制一套视觉实现。
- 阶段未完成时使用“受阻”或“部分完成”，不得把未验证页面标为已验证。
- 每阶段结束输出：改动摘要、验证命令及结果、未完成项、下一阶段建议。
- 每张任务卡结束时填写“结果”段落；只有任务卡验收条件全部有证据，状态才可改为 `verified`。
- 阶段复核任务只审查前置任务，不顺手开展下一阶段实现；发现问题必须归回对应任务卡。
- 阶段 0 的两个阻断必须保持显式跟踪：Blog coverage 不得通过降低阈值解决；gosso-admin 测试不得继续使用 `localhost:8443`，标准契约是 `https://sso.dev.local`。

## 推荐节奏

每阶段单独提交，阶段内可分多个小提交。先在 `codex/*` 分支工作，检查通过后再合入本地 `main`。不要在新会话中自动推送远端、发布包或部署生产环境。
