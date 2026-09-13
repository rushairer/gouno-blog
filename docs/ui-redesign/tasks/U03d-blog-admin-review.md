# U03d：Blog Admin 内容阶段复核

状态：review-pending。前置：U03b、U03c（均已 verified）。

## 目标与范围

独立复核 Admin Shell、列表、编辑器和支持页面的功能保留、权限、移动布局、主题和表单状态；发现问题归回 U03a/U03b/U03c。

## 通过条件

- [ ] 所有 `/admin/*` 内容管理条目均有独立实现/渲染验证证据。
- [ ] 草稿/发布/预览/媒体/批量/确认流程没有静默行为变化。
- [ ] 1440/1024/768/390 代表视口、light/dark、关键权限/错误状态完成独立浏览器复核。
- [ ] 未验证的管理会话范围明确记录并形成最终结论。

## 2026-09-13 静态对齐复核检查点

- 本检查点复核的 UI 实现 tree 截止 `b5be525965eab771a1999b8e351bb02e1ef8cf6d`；本轮只把能够由 Showcase、源码与自动化明确证明的漂移归回产品实现，不把静态审查冒充浏览器验收。
- Admin Shell：继续使用 `@gouno/ui/gouno` 的 `AppShell` / `NavigationGroup` / `PageContainer`，品牌标记来自发布包 `@gouno/ui/brand-icons/gouno-blog.svg`；运行时站点标题继续属于产品数据，不硬编码 Showcase fixture 文案。
- Dashboard：初始 analytics 加载失败已对齐 Showcase 的 `数据概览加载失败` + backend detail + `重新载入` 恢复路径；失败后重试回到 loading 并重新读取真实 API。主线提交：`9e57fe0371527c4e4554dd456d70aeb0c25ea2b5`。
- Posts / Pages：列表容器、桌面表格与移动 ListStack/ListRow 路径保持 canonical shared UI 边界；本轮静态对比未发现需要重新引入产品 CSS 的结构漂移。
- Media Library：消费者侧 `className="block"` workaround 已删除，选择框完全依赖 `@gouno/ui@0.3.5` 的 canonical block-level Checkbox；根因修复不再由 Blog CSS 或页面局部覆盖承担。
- Post / Page Editor：ready state 已使用 Showcase 的 canonical Card container model；Post Editor 为 `13rem / minmax(0,1fr) / 19rem`，Page Editor 为 `minmax(0,1fr) / 19rem`，旧 floating/sticky surface 与历史 grid CSS 已退出。Post Editor 最后一处 `fieldset-unstyled` compatibility hook 已在 `b5be525965eab771a1999b8e351bb02e1ef8cf6d` 删除，改为显式 `min-w-0 border-0 p-0`，并由 `lint:ui` 阻止重新引入。
- Site Settings：初始设置加载失败现在 fail closed，不再在请求失败后继续挂载默认值表单；对齐 Showcase 的 `站点设置加载失败` + detail + retry。主线提交：`0d41f55f20ae1206d59e198442fb29f8e5587a25`。
- Dependency ownership：`blog-frontend/package.json` 的基础 UI 依赖边界已收敛到 `@gouno/ui@0.3.5` + Tailwind；不再直接声明 Radix/shadcn-era primitive 依赖，lockfile 中的 `@radix-ui/*` 仅作为传递依赖存在，不属于产品 manifest 直依赖。
- CSS ownership：全局入口按 `Tailwind -> @gouno/ui/tokens.css -> @gouno/ui/base.css` 加载，产品全局补充只保留最后加载的 reduced-motion accessibility override；`editor.css` 与 `agent-console.css` 保持 feature scope。`check-ui-contracts.mjs` / `check-css-cascade.mjs` 继续阻止 direct Radix、retired primitive selectors、`data-slot` 覆盖、`!important`、具体颜色和旧 control class 回流。
- Legacy selector sweep：运行代码中未发现 `input-field`、`checkbox-field`、`editor-panel` 产品兼容 hook；这些字符串只保留在回归保护规则或历史记录中。
- U04b Connector Module Hold 未触碰；本检查点没有借 U03d 顺手改 Connector。

## 同轮公开 Blog 对齐证据

公开站点不计入 U03d 通过条件，但同轮已完成以下 Showcase reconciliation：

- Home：`featured-layout*` 与 `editorial-story` 已没有 CSS owner，却仍被 JSX/测试保留。主线提交 `04bc1502d9c8effdec1331eeb4518d6953d87fdf` 已改用 Showcase 的 `grid gap-x-8 md:grid-cols-2`，并把回归测试改为锁定 canonical grid / semantic article 结构，而不是锁定已退休 class 名。
- Article Detail：主线提交 `d31095d42d5b098559daf6d7a5c645120e63eb46` 已对齐 Showcase 阅读构图，同时保留 preview、likes、comments、replies、reporting、analytics、sticky TOC 与 SEO。
- Public Shell active navigation：主线提交 `4f2dfa1d5363902cb8a7a0904a80d5a6ee87a58e` 已统一桌面和移动导航 active-route 语义。
- NotFound：主线提交 `877636b1dc40ceaf11ce9cf5ab0865707cb9ac58` 已替换为 Showcase canonical Result composition，同时保留页面标题、搜索入口、路由动作与返回行为。

## 自动化证据

- Dashboard parity 的最终两文件 diff 在 PR #201 的 CI / Images 全绿后以等价 squash tree 推入主线。
- Site Settings parity 的 branch-only full `blog-frontend npm run quality` 通过；对应主线 CI 通过。
- Public Home parity 的 PR #202 完成 Backend quality、Frontend quality、Seed quality、Compose config、Dependency review、Isolated database integration 以及 backend/frontend/seed Images 全绿后，以完全相同 final tree 推入主线。
- Post Editor fieldset cleanup 的 PR #206 在合并前 CI / Images 全绿；合并提交为 `b5be525965eab771a1999b8e351bb02e1ef8cf6d`。
- Frontend quality 仍覆盖 format、lint、UI/CSS contracts、TypeScript、coverage 与 production build。

## 仍待独立浏览器复核

- 1440 / 1024 / 768 / 390 四代表视口的真实渲染，不以静态 Tailwind class 对比替代。
- light / dark 双主题下的实际计算样式、换行、overflow、sticky / Sheet 行为与 console。
- Dashboard、Posts、Pages、Media、Settings、Users、Post Editor、Page Editor 的 authenticated live route。
- selection / batch actions、Drawer / Modal、真实 retry、保存 / 发布 / 预览、Sudo / 权限组合及 live error injection。
- AI 页面正式 rendered QA；Connector 继续受 U04b Hold 约束。

## 结果

代码级 Showcase reconciliation 与本轮静态封板检查已收口到 UI 实现 tree `b5be525965eab771a1999b8e351bb02e1ef8cf6d`：基础依赖、全局 CSS ownership、历史兼容 hook、公开 Blog 的主要 Showcase 漂移均已有主线事实或回归保护。当前剩余工作不再是继续扩大 UI 重构，而是 U03d 定义要求的独立 rendered/browser QA。

当前执行环境没有 Browser/IAB runtime，也没有可据此完成四视口 × 双主题 × authenticated interaction 的独立证据，因此状态继续保持 `review-pending`，不得标为 `verified`。
