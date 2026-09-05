# Gouno 产品家族 UI 重构执行计划

## 工作方式

本计划采用“一个阶段一个新任务”的方式执行。每个新任务开始时必须先阅读：

1. 根目录 `AGENTS.md`；
2. 本文件；
3. `docs/ui-redesign/migration.json` 和 `MIGRATION.md`；
4. 当前仓库与相关仓库的 `git status`。

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

## 阶段规则

- 不降低测试覆盖率门槛，不删除测试来获得绿色结果。
- 不修改后端接口、认证安全机制、数据库或会话语义。
- Connector 只改展示层，除非提示词明确授权，不改 OAuth、凭证、Sandbox、Outbox 和投递状态转换。
- 每阶段优先使用现有共享组件；新增组件先进入 `packages/ui`，不得在消费者中复制一套视觉实现。
- 阶段未完成时使用“受阻”或“部分完成”，不得把未验证页面标为已验证。
- 每阶段结束输出：改动摘要、验证命令及结果、未完成项、下一阶段建议。

## 推荐节奏

每阶段单独提交，阶段内可分多个小提交。先在 `codex/*` 分支工作，检查通过后再合入本地 `main`。不要在新会话中自动推送远端、发布包或部署生产环境。
