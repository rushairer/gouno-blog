# 阶段提示词

以下提示词是旧版的大阶段入口，可用于快速了解范围。实际执行请优先使用 `docs/ui-redesign/tasks/` 下的单张任务卡；它们采用 `docs/quality/tasks` 的任务、验收和结果记录方式。每次新会话只执行一张任务卡。

## 任务卡通用启动段

```text
你正在执行 docs/ui-redesign/tasks/ 下的一张 UI 重构任务卡。

先阅读根目录 AGENTS.md、docs/ui-redesign/PLAN.md、docs/ui-redesign/migration.json、docs/ui-redesign/MIGRATION.md、对应任务卡，以及当前相关仓库的 git status。核对任务卡前置条件、当前 HEAD 和工作区；前置不满足时停止实现并记录 blocked。

只处理任务卡范围，保留未相关改动，使用 apply_patch。保持现有 API、权限、认证、安全、数据库和会话语义；Connector 未明确授权时只改展示层。不要降低测试门槛、删除断言、通过重复运行掩盖失败、手工编辑分发归档或发布远端。

完成后必须填写任务卡“结果”，完成任务项的勾选状态，更新 migration.json 和 MIGRATION.md，并报告实际命令、退出状态、浏览器证据、未测项、阻断项和下一任务交接信息。
```

## 通用前缀

```text
你正在执行 Gouno 产品家族 UI 重构的一个阶段。

先阅读：
1. /Users/aben/Git/gouno-blog/AGENTS.md
2. /Users/aben/Git/gouno-blog/docs/ui-redesign/PLAN.md
3. /Users/aben/Git/gouno-blog/docs/ui-redesign/migration.json
4. /Users/aben/Git/gouno-blog/docs/ui-redesign/MIGRATION.md
5. 当前仓库以及相关仓库的 git status

遵守这些边界：保持 React/Vite/TypeScript/Tailwind/Radix 架构；不改后端接口、数据库、认证安全机制或会话语义；Connector 未获得明确授权时只改展示层，不改 OAuth、凭证、Sandbox、Outbox 和投递状态转换。

工作要求：先盘点再编辑；使用 apply_patch；保持现有未相关改动；运行与改动匹配的测试和质量检查；更新 migration.json 与 MIGRATION.md；未实际验证的条目不能标记为已验证；不要发布远端、注册包或部署生产。

完成时报告：改动文件、功能保留说明、验证命令/结果、阻断项、下一阶段建议。
```

## 阶段 0：盘点与基线

```text
[粘贴通用前缀]

当前阶段：0（基线、入口和依赖盘点）。
请交叉扫描 blog-frontend 和 gosso-admin-frontend 的路由、条件渲染、弹窗、抽屉、错误/空/加载/无权限状态和 API 依赖，补齐 migration.json 的具体条目。检查共享包消费、Tailwind @source、分发归档和质量脚本。运行两仓库及 packages/ui 的基线检查，记录准确结果，不实现大规模视觉改动。
```

## 阶段 1：共享包与设计系统

```text
[粘贴通用前缀]

当前阶段：1（共享包与设计系统定版）。
完善 packages/ui 的令牌、ThemeProvider、主题 bootstrap、基础组件、AdminShell、列表/表格、表单、反馈、浮层和独立 showcase。保证 blog、blog-admin、gosso-admin 三品牌及 light/dark/system 可用，处理 SSR/受限运行环境。使用 npm pack 和分发脚本验证两个消费者的精确归档与 integrity。不要迁移业务页面。
```

## 阶段 2：Blog 公共发现与阅读

```text
[粘贴通用前缀]

当前阶段：2（Blog 公共发现与阅读）。
迁移 /、/articles、/search、/categories、/categories/:slug、/tags、/tags/:slug、/archive、/articles/:slug、/about、/:slug，以及公共账户状态和 404。保留查询参数、分页、筛选、Markdown、目录锚点、代码复制、图片、SEO、点赞、评论、回复、举报、加载/空/错误状态。优先复用 @gouno/ui，完成单元测试和 1440/390 的代表性浏览器验证。
```

## 阶段 3：Blog Admin 内容管理

```text
[粘贴通用前缀]

当前阶段：3（Blog Admin 外壳与内容管理）。
迁移 AdminShell 及 /admin、dashboard、posts、post editor、pages、page editor、categories、tags、comments、notifications、media、users、settings。保留权限过滤、草稿恢复、版本恢复、保存/发布、预览、SEO、媒体选择/生成、批量操作、确认弹窗和表单错误。不要改 API 或业务状态转换。覆盖桌面、平板、移动端布局与键盘焦点。
```

## 阶段 4：AI 与 Connector

```text
[粘贴通用前缀]

当前阶段：4（AI 工作台与 Connector 展示迁移）。
迁移 /admin/ai-ops 的 overview、inbox、automation、records、advanced、Agent/Workflow/Run/Approval/Preview/配置等子视图，以及 Connector workspace。保留 tab、record、run、workflow 参数语义和所有失败/禁用状态。Connector 仅迁移展示层，严禁修改 OAuth、凭证、Sandbox、Outbox、审批、Mock 投递、重试和撤销的业务行为。
```

## 阶段 5：gosso-admin 认证与账户

```text
[粘贴通用前缀]

当前阶段：5（gosso-admin 认证与账户）。
在 /Users/aben/Git/gosso-admin/gosso-admin-frontend 迁移 /login、/callback、/forgot-password、/reset-password、/、/account-settings 及 profile/password/mfa/passkeys/sessions 子视图。保留密码/Passkey、MFA、近期强认证、账户不匹配、hash/query、跳转和错误反馈契约。验证根路径与 /identity-admin 子路径构建。
```

## 阶段 6：gosso-admin 系统管理

```text
[粘贴通用前缀]

当前阶段：6（gosso-admin 系统管理）。
迁移 /system-management 及 clients、users、audit-logs、site-settings、system 全部列表、详情、编辑、密钥、轮换、删除、角色、重置、解锁、MFA 重置、筛选和无效标签回退。保留权限、确认弹窗、错误/空/加载状态和服务调用语义。
```

## 阶段 7：分发与构建

```text
[粘贴通用前缀]

当前阶段：7（双仓库消费、分发与构建）。
验证 packages/ui 的 npm pack、版本/integrity 清单、两个前端的 file 依赖、独立干净检出后的 npm ci、Tailwind @source、Docker 构建、Compose 配置，以及 gosso-admin 根路径和 /identity-admin 构建。修复分发链问题，但不手工编辑归档产物。
```

## 阶段 8：最终 QA 与交付

```text
[粘贴通用前缀]

当前阶段：8（浏览器 QA、无障碍、清理与交付）。
按 migration.json 逐条检查浅色/深色、桌面/平板/移动、文字放大、键盘导航、焦点、弹窗恢复、长文本、空数据、大量数据、网络失败、权限和深链接。使用 https://blog.dev.local 与 https://sso.dev.local，禁止 8443。生成 1440px/390px 代表截图，清理无引用旧 UI、覆盖样式和临时适配层，汇总两仓库检查日志、提交记录和明确未验证项。只有全量证据齐全时才报告完成。
```
