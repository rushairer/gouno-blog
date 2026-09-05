# U02b：Blog 阅读页与公共状态

状态：verified。前置：U02a。

## 目标与范围

迁移 `/articles/:slug`、`/about`、`/:slug`、账户通知/设置公共状态、404、错误边界和认证回调窗口。保留预览参数、Markdown、目录锚点、代码复制、SEO、点赞、评论、回复、举报及会话恢复。

## 验收

- [x] 文章阅读栏、代码、图片、锚点和长文本表现符合令牌。
- [x] 互动成功、失败、未登录和无权限状态有回归。
- [x] SEO 与预览参数不被视觉迁移破坏。
- [x] 代表性桌面/移动、主题和键盘证据齐全或明确未验证。

## 结果

- 起始基线：U02a verified；`gouno-blog` HEAD `91029fe`、`gosso-admin` HEAD `f9466f3`，两个仓库均为干净 `main`。任务开始时 U02b 涉及条目均为 `not-started` / `not-run`。
- 改动：`PostDetail`、`MarkdownRenderer`、自定义页/About、账户通知/设置、404、错误边界和 Step-Up 回调公共状态改用 `@gouno/ui` 与当前 Tailwind 令牌；补齐 Markdown 长文、图片、表格、代码复制、目录锚点、响应式阅读栏，以及点赞/评论/举报失败的页内反馈。API 路径、预览回退、SEO、权限判断、认证回调、会话恢复和 GOSSO Admin 身份管理归属保持不变；未触及 Connector、后端、数据库或会话实现。
- 自动化证据：定向回归 `npm run test:run -- src/pages/__tests__/PostDetail.test.tsx src/pages/__tests__/CustomPageView.test.tsx src/pages/__tests__/NotFound.test.tsx src/pages/__tests__/AccountNotifications.test.tsx src/__tests__/App.test.tsx` 退出 0（5 文件 / 21 测试）；错误边界与设置定向回归退出 0（2 文件 / 4 测试）。最终 `npm run quality` 退出 0（47 文件 / 179 测试，statements 55.81%、branches 45.89%、functions 45.62%、lines 57.96%，生产构建成功）。既有 oxlint warnings 保持非阻断。
- 浏览器证据：本地 Vite `http://127.0.0.1:5174` 中，`/about` 在 1440×900 浅色和 390×844 深色可见且布局正确；`/not-a-real-page` 在桌面与 390×844 移动端可见；`/?step_up_success=1` 在 1440×900 深色显示共享回调完成状态和关闭按钮。主题选择后刷新确认 `data-theme=light/dark`。键盘代码复制由定向测试验证。
- 未测/阻断：本地 `127.0.0.1:8082` API 未运行（`curl` 退出 7），因此真实文章数据、已登录通知/设置页面、真实点赞/评论/举报浏览器操作和 768px 平板视口未做浏览器验证；对应 API、权限和状态由单元/组件回归覆盖。无实现阻断。
- 过程失败记录：首轮 TypeScript 因误用 `Banner.action` / `Feedback.role` 退出 2；首轮定向测试因锚点预期、嵌套 alert 与 jsdom `window.close` 测试夹具问题退出 1；新增错误边界/设置测试首轮因 mock/Provider 夹具退出 1。均修正根因后单次通过，未降低门槛或删除断言。
- 下一任务交接：U02c 可开始独立复核；重点在可用本地后端/认证会话时补真实文章和账户浏览器证据，并复核 U02a/U02b 公共路由，不开展 Admin 实现。
