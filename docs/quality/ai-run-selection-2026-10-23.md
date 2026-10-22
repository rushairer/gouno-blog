# AI Operations：Agent 详情请求归属修复

## 范围与结论

基线为 `936a81691505835c758a1d35cca9ab933ddd77a1`（#381 已验收并合并）。本批只处理 `AIOperations.tsx` 的 Agent 运行详情读取与页面生命周期，不扩展 A+ 范围，不修改审批/生成/发布 API、权限、BFF、Connector、依赖或工作流阈值。

问题并非一般性的 lint 清理：旧请求成功会覆盖新选择，旧请求失败会在新选择或其他 Tab 中显示过期 Notification。URL 指定但不在当前列表中的 Run 也存在独立的无条件写入路径。

## 先失败的回归证据

最初 `f64fd3a` 的 CI 39870303546 在测试文件格式检查处停止，不能作为缺陷复现。格式修正后的测试专用提交 `fd96a09f331e408add3eb065933eec01a3edbe32` 在 CI **39870516464** / Frontend quality **120143763153** 通过格式、lint、UI/CSS 和 TypeScript 检查后，真正执行了测试。

结果为 **367 项中 362 通过、5 失败**；原有 360 项全部通过。新增七项真实页面回归中的五个失败场景：旧默认详情覆盖新选择、旧请求错误污染新选择、URL-only 详情覆盖列表选择、切换 Workflow 类型后的旧错误、离开运行中心后的旧错误。当前请求失败后的明确重试及 StrictMode 初始选择两项正向场景通过。

这些测试控制共享 API adapter 返回的 HTTP Response，渲染真实页面、RecordsWorkspace 和反馈 Provider；它们不是生产事故取证，也不替代真实浏览器或后端权限验收。

## 修复边界

URL 与列表请求使用同一递增 generation；只有当前 generation 能提交详情或错误。新请求开始清空旧的可操作详情。切换上下文与卸载同步使旧 generation 失效，StrictMode 下一次 setup 仍可重新发起有效查询。重复点击当前记录类型不再意外清空选择。删除完成只清除仍对应被删除 Run 的选择，避免干扰随后选择的其他记录。

保留现有当前错误反馈、URL-only 查询静默失败、手工重试和导航语义。请求仍可在传输层完成，但过期结果不会写回 UI；没有声称取消服务器工作。没有新增业务自动重试。

## 未被本批解决的事项

整页 `load()` 的并发刷新、其他页面 Hook/渲染告警、局部原始错误文案与日志边界，以及 #338 恢复演练不属于本次已验收范围。#359、#338 保持开放。完整 A+ 必须针对最终目标 SHA 单独评估，不能由这组测试推导。

## 验证与 UI 认证

本地环境无法解析 GitHub/依赖域名，完整锁定工具链测试在既有 Actions 中执行。最终 head 的 CI、Images、Browser、Showcase 结果和 artifact 哈希记录到 PR #382 验收评论；失败或未完成不能当作通过。

本批未修改 canonical JSX、样式或产品文案，但改到了已认证 Product 文件，因此 AI family 暂时降为 `needs-manual-recertification`。现有认证引用保留为历史记录，不冒充新证据。复核记录见 `docs/ui-redesign/ai-run-selection-review-2026-10-23.md`。
