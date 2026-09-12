# U03c：Blog Admin 支持页面

状态：verified。前置：U03a（verified）。

## 目标与范围

迁移 Categories、Tags、Comments、Notifications、Media Library、Users、Site Settings 的完整展示层、抽屉、批量操作和确认弹窗。

## 验收

- [x] 各页面的筛选、排序、分页、批量和危险操作行为保留。
- [x] 媒体无图、上传/生成失败、评论审核和通知状态有自动化回归证据。
- [x] 站点设置分组、表单错误和保存反馈有自动化回归证据。
- [x] 共享组件、语义颜色、CSS ownership 与 canonical UI contract 检查通过。

## 结果

- 当前复核基线：2026-09-13 `main` `6f722dcdd34f3495a293d7a77dff4baf35e1120a`。Blog vendored `@gouno/ui` provenance 为 `cb946376e32bcc0db18d13fb09d89d71b5780dca`，与当时 `rushairer/gouno-ui/main` 完全一致。
- 实现：Categories、Tags、Comments、Notifications、Media、Users 与 Site Settings 已位于当前 canonical Gouno UI / Tailwind v4 边界；旧产品级 `base/components/design-system-alignment/redesign/tokens/index` 样式已退出运行时并由 UI contract 阻止回流。危险操作继续使用受控确认/Step-Up/Sudo 路径，不恢复 native browser dialog。
- CSS ownership：`lint:ui` 禁止产品 CSS 接管 canonical primitive 与 `[data-slot]`；`lint:css` 禁止 `!important`、未分层样式和已退休 AI/Workflow selector。`agent-console.css` 仅允许 AI Settings / AI Operations 引入。
- 自动化证据：本轮连续收口 PR #181–#186 均在 clean head 上通过仓库 CI；最新 #186 同时通过 CI 与 Images，Frontend quality 包含 format、oxlint、UI/CSS contracts、TypeScript、coverage 与 production build。
- 浏览器证据：U03c 的最终独立渲染/响应式复核归 U03d；本次收口会话未重复执行 U03d 所要求的完整 Browser QA，因此不在此伪造截图或像素级结论。
- 阻断：U03c 无代码阻断。下一任务为 U03d 独立 Blog Admin 阶段复核。
