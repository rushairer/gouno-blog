# U03b：Blog Posts/Pages 编辑器

状态：verified。前置：U03a（已 verified）。

## 目标与范围

迁移文章/页面新建与编辑、草稿恢复、版本恢复、保存/发布、预览、SEO、AI 辅助、封面和媒体选择/生成的展示层。保持 API、校验、请求和状态转换。

## 验收

- [x] 未保存草稿不会因布局重排丢失。
- [x] 保存、发布、恢复、预览、错误和冲突提示有回归。
- [x] 编辑器在移动端按规则重排，长代码/宽表内部滚动。
- [x] 业务写入入口和权限行为无变化。

## 结果

- 起始基线：U03a 已 verified；Blog `main` HEAD `ababc210f3a5b75a23d0b0fa2d49991567c48518`，相关 `gosso-admin` `main` HEAD `f9466f3c103cd7a40e24ec90556a359331e2adc8`，两仓库起始工作区干净。
- 改动：编辑器命令栏、画布、检查器、AI 写作/生图面板、版本历史、候选和预览区域迁移到共享 token 驱动的响应式展示层；代码块与表格在内部滚动；Post/Page 编辑器错误状态显式展示。未修改 API、权限、认证、安全、数据库、会话或 Connector 行为。
- 验证命令：定向 `npm run test:run -- src/components/editor/__tests__/ContentEditorFrame.test.tsx src/pages/admin/__tests__/PostEditor.test.tsx src/pages/admin/__tests__/PageEditor.test.tsx` exit 0（3 files / 15 tests）；`npm run quality` exit 0（50 files / 196 tests；coverage statements 57.06%、branches 47.87%、functions 46.98%、lines 59.32%）；`npm run build` exit 0；source compose build/up exit 0；`git diff --check` exit 0。
- 浏览器证据：认证会话下标准 HTTPS `https://blog.dev.local` 使用重建 source 镜像；默认桌面显示文章大纲/画布/检查器三栏，768×1024 隐藏大纲并保留检查器，390×844 命令栏/编辑区/检查器纵向重排。未保存标题和正文跨视口保留；Markdown 预览的长代码、宽表在内部容器滚动；文章与单页编辑器页面级横向溢出均为 false；console error/warning 为 0。临时 viewport 已 reset。
- 未测项：真实后端保存、发布、版本恢复、前台预览和 409 冲突未在浏览器提交；AI 写作、生图、媒体选择/生成和 SEO 请求未在浏览器触发；生产域名、强制 API 错误注入及全部替代角色会话未测。上述业务分支由定向 Vitest 回归覆盖。
- 阻断项：无。已知非阻断 oxlint/Vite/jsdom/font/Lightning CSS 警告保持原样。
- 下一任务交接：U03c 已解锁；继续 Taxonomy、Comments、Notifications、Media、Settings 及 Users 的完整展示与安全弹窗，保持编辑器 API/权限语义不变。
