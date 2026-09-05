# U03a：Blog Admin Shell、Dashboard 与列表模板

状态：verified。前置：U02c。

## 目标与范围

迁移 AdminShell、`/admin`、`/admin/dashboard`、Posts、Pages、Users 等列表入口，建立统一页面标题、操作区、筛选栏、表格/紧凑移动行、分页和权限过滤模板。暂不重写编辑器内部业务。

## 验收

- [x] 桌面侧栏与 1024px 以下导航 Sheet 行为通过。
- [x] 列表 loading/empty/error/selection/批量操作状态保留。
- [x] 权限过滤和关键操作入口不改变。
- [x] 1440/1024/768/390 有布局证据。

## 结果

- 起始基线：U02c 在本次自动化中复核后仍为 `verified`；`gouno-blog` 从干净 `main` HEAD `7b773bdbda705209e7bacecf243c60b1cc8de62d` 创建 `codex/u03a-blog-admin-shell`，相关 `gosso-admin` 为干净 `main` HEAD `f9466f3c103cd7a40e24ec90556a359331e2adc8`。未触碰 Connector、后端、认证、会话、数据库或生产配置。
- 实现：AdminShell 保留现有通知、搜索、主题、登出和权限过滤路径，收紧小屏工具栏并继续使用共享 navigation Sheet。Posts、Pages、Users 保留桌面表格和原 API/操作判断，同时以 `@gouno/ui` `ListStack`/`ListRow` 增加 768px 以下紧凑移动行；筛选、分页、选择、批量操作、复制、预览、编辑、删除以及成员 Sudo/MFA 路径均未改业务语义。Dashboard 已有共享 AdminPage/Card/Table 模板经本次回归和真实数据复核确认。
- 自动化证据：定向命令 `npm run test:run -- src/layouts/__tests__/AdminShell.test.tsx src/pages/admin/__tests__/Dashboard.test.tsx src/pages/admin/__tests__/Posts.test.tsx src/pages/admin/__tests__/Pages.test.tsx src/pages/admin/__tests__/Users.test.tsx` 退出 0（5 文件 / 13 测试）。首次 `npm run quality` 因旧 `src/pages/__tests__/Pages.test.tsx` 仍假设单一 DOM 行而退出 1；更新该断言以同时验证桌面/移动渲染后，最终 `npm run quality` 退出 0（49 文件 / 185 测试；statements 55.81%、branches 46.42%、functions 45.56%、lines 58.02%），格式、oxlint、UI-contract、CSS-cascade、TypeScript、coverage 和生产构建全部通过；既有 oxlint warnings 非阻断。`git diff --check` 退出 0。两次本地 source compose 前端构建/替换均退出 0，最终容器使用最新源码。
- 浏览器证据：认证会话下通过标准域名 `https://blog.dev.local` 验证本地 source 镜像。1440×900 深色 Dashboard 显示桌面侧栏和四列指标；1024×768 仍为桌面侧栏/四列指标；768×1024 显示导航 Sheet、两列指标和浅色主题；390×844 深色下 Posts、Pages、Users 均隐藏桌面表格并显示紧凑移动行，页面级横向溢出均为 false。`/admin/posts?status=draft&page=1` 保留查询参数，勾选真实草稿后显示“已选择 1 篇”批量操作栏，再取消选择；未触发发布、删除或 AI 写操作。Users 实时显示 Sudo 锁定并挂载 6 个移动行，未解锁或执行成员变更。浏览器 console error/warning 为 0；临时视口已恢复。
- 未测项：未在浏览器强制注入 API error/retry；本地数据量不足以验证真实多页翻页；未建立全部角色组合的独立浏览器会话；未执行 Sudo 解锁、成员写操作或生产域名流程。上述 error/empty/retry、权限过滤、关键入口与选择/批量契约由新增/既有单元测试覆盖。
- 阻断：无。
- 下一任务交接：U03b、U03c 已解锁。编辑器内部保持在 U03b；Taxonomy、Comments、Notifications、Media、Settings 及 Users 的完整弹窗/安全展示留给 U03c。
