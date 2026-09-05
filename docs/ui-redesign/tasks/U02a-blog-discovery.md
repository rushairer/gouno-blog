# U02a：Blog 公共 Shell 与发现页

状态：verified。前置：U01d。

## 目标与范围

迁移 PublicShell、首页、文章列表、搜索、分类/标签索引与详情入口：`/`、`/articles`、`/search`、`/categories`、`/categories/:slug`、`/tags`、`/tags/:slug`、`/archive`。保留筛选、分页、站点首页配置、链接、加载/空/错误状态。

## 验收

- [x] 发现页使用共享令牌和组件，不保留重复视觉体系。
- [x] 查询参数、筛选、分页和分类/标签链接回归通过。
- [x] 1440px、768px、390px 至少有代表证据；light/dark 有证据。
- [x] 相关测试和构建通过。

## 结果

- 起始基线：U01d verified；`gouno-blog` HEAD `607c07b`，工作区干净；相关 `gosso-admin` HEAD `581ae03`，工作区干净。
- 改动：`Categories`、`Tags`、`Archive` 使用 `@gouno/ui` 的 `PageHeader`/`Panel` 和共享令牌 utility classes；保留 API、路由、查询参数、筛选、分页、链接及 loading/empty/error 语义。未触及 Connector、认证、权限、数据库或会话。
- 验证：`npm run quality`（Blog）退出 0；44 个测试文件、167 个测试通过；分支覆盖率 45.03%；生产构建通过。定向公共页面回归 3 个文件 / 12 个测试通过。Playwright 浏览器在 1440×900、768×1024、390×844 分别加载首页与 `/categories`，并验证 light/dark 的 `documentElement.dataset.theme`。
- 阻断：无。
- 下一任务交接：U02b；继续沿用 `@gouno/ui` 组件，不改 API/认证/权限语义。
