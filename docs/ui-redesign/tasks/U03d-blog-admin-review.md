# U03d：Blog Admin 内容阶段复核

状态：verified。前置：U03b、U03c（均已 verified）。

## 目标与范围

独立复核 Admin Shell、列表、编辑器和支持页面的功能保留、权限、移动布局、主题和表单状态；发现问题归回 U03a/U03b/U03c。

## 通过条件

- [x] 所有 `/admin/*` 内容管理条目均有独立实现/渲染验证证据。
- [x] 草稿/发布/预览/媒体/批量/确认流程没有静默行为变化。
- [x] 1440/1024/768/390 代表视口、light/dark、关键权限/错误状态完成独立浏览器复核。
- [x] 未验证的管理会话范围明确记录并形成最终结论。

## 代码级 Showcase 对齐检查点

- 本阶段 UI 实现已完成一轮 Showcase reconciliation：Admin Shell、Dashboard、Posts/Pages 列表、Post/Page Editor、Media、Site Settings，以及公开 Blog 的 Home、Article Detail、Navigation active state、NotFound 均已回到 canonical `@gouno/ui` / Showcase 边界。
- Admin Shell 使用 `@gouno/ui/gouno` 的 `AppShell` / `NavigationGroup` / `PageContainer`；品牌标记来自发布包，运行时站点标题继续属于产品数据。
- Media Library 已删除消费者侧 Checkbox workaround，选择框完全依赖 `@gouno/ui@0.3.5` 的 canonical Checkbox。
- Post/Page Editor 使用 canonical Card container model；Post Editor 最后一处 `fieldset-unstyled` compatibility hook 已由 `b5be525965eab771a1999b8e351bb02e1ef8cf6d` 删除并增加 `lint:ui` 防回流。
- Site Settings 初始加载失败 fail closed，并使用 canonical error/detail/retry 恢复路径。
- `blog-frontend/package.json` 的基础 UI 依赖边界收敛到 `@gouno/ui@0.3.5` + Tailwind；不再直接声明 Radix/shadcn-era primitive 依赖。
- 全局样式入口按 `Tailwind -> @gouno/ui/tokens.css -> @gouno/ui/base.css` 加载；产品全局补充只保留 reduced-motion accessibility override，`editor.css` / `agent-console.css` 保持 feature scope。
- UI/CSS contracts 持续阻止 direct Radix、retired primitive selectors、`data-slot` 覆盖、`!important`、具体颜色和旧 control class 回流。
- U04b Connector Module Hold 未触碰。

## 浏览器证据

### U03a：真实认证会话

U03a 已在标准 HTTPS `https://blog.dev.local` 的真实认证会话下完成：

- Dashboard：1440×900、1024×768 桌面布局；768×1024 light 使用导航 Sheet；无 document overflow。
- Posts / Pages：390×844 dark 使用 compact rows，桌面表格隐藏；真实 draft 行可选择并出现 batch toolbar。
- Users：真实成员列表在 Sudo lock 下正常挂载；未执行高权限写操作。
- 浏览器 console error/warning 为 0。

### U03b：真实认证会话

U03b 已在真实认证会话下完成 Post/Page Editor：

- Desktop 显示 outline/canvas/inspector；768×1024 隐藏 outline 并保留 inspector；390×844 纵向重排。
- 未保存标题/正文在 viewport reflow 后保留。
- Markdown 长代码与宽表只在内部滚动；页面级横向 overflow 为 false。
- 浏览器 console error/warning 为 0。

### U03d：支持页独立 rendered/browser pass

PR #209 增加隔离的 Playwright browser-acceptance harness，不修改生产认证、后端接口或产品依赖边界。最终绿色证据：

- Workflow run：`34756247735`，head `b4581cd0817ad33679c5f73d3cb873ab0dcd3bab`。
- Chromium：Playwright `1.55.0`，最终 `59 passed`。
- 56 个支持页矩阵全部通过：Categories、Tags、Comments、Notifications、Media、Settings、Users × 1440/1024/768/390 × light/dark。
- 每个矩阵用例验证 canonical page container、`data-brand=blog-admin`、实际主题、无页面级横向 overflow、无未知 API fixture 请求、无 console warning/error/pageerror，并保存 full-page screenshot。
- 关键交互：390×844 dark Media Checkbox 几何与选择状态通过；Site Settings 注入首次 500 后 fail-closed + retry 恢复通过；Users 在模拟近期 MFA 已完成的 Sudo UI 状态下可打开 canonical edit Modal，未提交写操作。
- 浏览器 artifact：`blog-admin-browser-acceptance`，artifact ID `10316928262`，digest `sha256:3499b5d1bd40de075afdd2a3ca52c5cfede66df04d9625c09069d68c7da1ff14`。
- 人工抽查代表截图：390px dark Media、1024px light Settings、1440px light Users、768px dark Comments；截图与自动 overflow/console/theme 断言一致。Media 选择框未出现此前的额外底部空隙或拉伸。

### U03d 最终产品级 rendered gate

PR #216 将既有 Blog Admin / AI Workspace browser acceptance 与公开 Blog 验收合并为单一 Blog product gate，并补齐 Public Blog 的四视口 × 双主题 rendered matrix 与关键交互。该 PR 已 squash 合入 `main`，主分支提交为 `10d08d182b06a4577c531dad96cc1498af3edbf2`。

最终绿色证据：

- UI Browser Acceptance workflow run：`34790314197`；PR head `62b9b29d8c20a4f76f4ca9427cac438021c0767f`，GitHub merge ref `8568baa3582669bb057096ce7d74e30066dbf6f8`。
- Chromium 最终结果：`247 passed`。
- Public Blog 新增 96 个 rendered matrix case：12 条公开路由 × 1440/1024/768/390 × light/dark。
- Public Blog 新增 5 个关键交互：移动导航关闭/跳转、搜索与 active-route 语义、Tag route family、390px Article Detail containment + related navigation、运行时自定义页面导航。
- 既有 AI Workspace 87 个 case 与 Blog Admin support 59 个 case 在同一最终 run 中全部继续通过，没有因 Public Blog 验收接入产生回归。
- Public matrix 持续验证主题/品牌所有权、页面级横向 overflow、console warning/error/pageerror、未知 API fixture 请求和目标页面 heading；所有 rendered case 均保留 full-page browser evidence。
- Browser artifact：`blog-browser-acceptance`，artifact ID `10327249140`，digest `sha256:3740c239b692a76cec6bd319773a5fa299f9de4b06c4df70608f0cb7c4d01bdf`。
- 同一 PR 的标准 CI run `34790314057` 全绿：Backend quality、Frontend quality、Seed quality、Compose config、Dependency review、Isolated database integration 均通过。
- Images run `34790314085` 全绿：frontend、backend、seed 三组镜像构建全部通过。

本次最终静态扫尾还删除了没有 CSS owner 的历史 product hooks，并将对应名称纳入 retired-class guard；Admin 权限/鉴权 fallback 使用 canonical `Card` / `Result` / `Alert` / `Spinner` composition，PublicShell 测试也改用语义化 `contentinfo` 查询，不再依赖历史 class selector。

## 功能与质量证据

- U03a/U03b/U03c 的 targeted regressions 与完整 `blog-frontend npm run quality` 均已通过对应阶段门槛；保存、发布、预览、批量、确认、权限与错误分支继续由自动化契约测试覆盖。
- PR #209 最新标准 CI 已通过 Backend quality、Frontend quality、Seed quality、Compose config、Dependency review、Isolated database integration。
- PR #216 在当前 `main` 前一提交 `0bf05390ec66b12a22d9165f177d1e4c68d1f967` 上生成 merge ref 并完成完整 CI、DB integration、三组 image build 与 247-case browser acceptance，覆盖了并行后端 #215 已进入主线后的组合状态。
- Frontend quality 覆盖 format、lint、UI/CSS contracts、TypeScript、coverage 与 production build。
- Playwright 文件使用独立 `*.pw.mjs` 约定和独立 `e2e/package.json`，不会进入 Vitest discovery，也不会修改产品 lockfile/依赖所有权。

## 明确未重放的范围

以下范围没有在本次 U03d 浏览器复核中冒充为已执行：

- PR #209 的支持页以及 PR #216 的 Public Blog browser session/API 使用测试层 fixture；它们不是一次新的真实 Gosso 登录或生产数据回放。真实认证浏览器证据来自 U03a/U03b。
- 没有在浏览器重新提交真实成员变更、站点设置写入、删除等 destructive mutation；对应行为仍由既有 API/组件回归测试保护。
- 没有重新遍历每一种 alternate-role 组合、真实 MFA/Passkey Step-Up、生产域名流程；这些继续属于后续集成/最终 QA 的可复核范围。
- AI 页面属于 U04a；Connector 继续受 U04b Hold 约束，不纳入 U03d 内容阶段验收。本次 #216 仅复用既有 AI rendered gate，未改变 Connector/OAuth/credential 行为。

## 结果

U03d 通过。代码级 Showcase reconciliation、真实认证的 Shell/List/Editor 证据、支持页四视口×双主题 rendered matrix、Public Blog 四视口×双主题 rendered matrix、关键交互、标准 CI、镜像构建与保留的浏览器 artifact 已形成闭环；最终统一 Blog product gate 为 `247 passed`。

本阶段不再存在需要继续扩大 Blog / Blog Admin UI/CSS 重构范围的阻断。后续若出现视觉问题，应以具体页面/组件为单位做点状修复；AI/Connector 继续按 U04a/U04b 各自状态推进。