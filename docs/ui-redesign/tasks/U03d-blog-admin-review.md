# U03d：Blog Admin 内容阶段复核

状态：review-pending。前置：U03b、U03c（均已 verified）。

## 目标与范围

独立复核 Admin Shell、列表、编辑器和支持页面的功能保留、权限、移动布局、主题和表单状态；发现问题归回 U03a/U03b/U03c。

## 通过条件

- [ ] 所有 `/admin/*` 内容管理条目均有独立实现/渲染验证证据。
- [ ] 草稿/发布/预览/媒体/批量/确认流程没有静默行为变化。
- [ ] 1440/1024/768/390 代表视口、light/dark、关键权限/错误状态完成独立浏览器复核。
- [ ] 未验证的管理会话范围明确记录并形成最终结论。

## 结果

- 代码前置已满足：U03a、U03b、U03c 均已进入主线；2026-09-13 `main` 为 `6f722dcdd34f3495a293d7a77dff4baf35e1120a`，当前没有遗留的用户 Blog Admin UI PR。
- 自动化前置已满足：最新 clean head #186 的 CI 与 Images 全绿，Frontend quality 覆盖 format、lint、UI/CSS contracts、typecheck、coverage 与 production build。
- 仍待执行：本任务定义的是独立阶段复核，不应把 CI 冒充渲染 QA。当前收口会话没有可用 Browser runtime，尚未重新完成全路由、四代表视口、双主题、console、交互与错误态复核，因此状态保持 `review-pending`，不得标为 `verified`。
- 下一步：在具备 Browser runtime 与可用本地/测试认证会话的独立会话执行 U03d；发现视觉/行为问题归回对应 U03 任务，不在复核任务中顺手改 AI/Connector。
