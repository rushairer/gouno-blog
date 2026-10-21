# Step-Up 弹窗生命周期复核：2026-10-21

## 范围与实际缺陷

基线为 main `06658db801d7501a8f2d8ce19642df5bbb85147d`，沿用 #359 的 React/间接状态边界验收范围。先核对 root AGENTS 与 certification ledger；本批不修改已认证 Product-owned 页面、Hook 实现、Connector、Canonical 包或认证状态。

对 `src/mfa.ts` 的原始内容校验 Git blob SHA 为 `7f2fde062622a270c321ed60151fc112cc43fbda`，再执行离线定时重现：

- 一次关闭产生两次取消：300ms 轮询每次安排 400ms 超时，取消既没有记录终态，也没有清理已排队的其他超时。
- 一秒前的历史成功记录使新弹窗的取消被判为成功：旧逻辑只看全局记录距当前是否小于 15 秒，不关联本次打开时间。
- 其他入口也缺少对应约束：Storage 事件任意非空值即可成功；BroadcastChannel 只检查 type；postMessage 只看 origin，不核对弹窗 source。

这些是本地 UI 完成状态和回调语义缺陷；不据此推断已经绕过后端 MFA、发生线上安全事件或产生 Provider 副作用。

## 固定约束

成功与取消共用一次性终态；先标记终态并释放资源，再通知调用方。首次发现关闭即停止轮询，只保留一个 400ms 宽限窗口；窗口中到达有效完成信号仍可成功。两个 Storage 键在立即检测和最终宽限检测中均被检查。

所有接收路径使用安全整数时间戳；拒绝早于本次打开、来自未来以及打开前已存在的时间标记，包含同毫秒的旧记录。JSON 标记必须匹配既有 type；旧标量键只接受完整十进制时间值，不使用容忍尾随垃圾的 parseInt。postMessage 同时检查同源与本次 popup source；Storage 仅接受 localStorage，而非 sessionStorage。

保留 BFF 入口、return_to 编码、弹窗尺寸/名称、callback sender、事件名、Storage 键和 BroadcastChannel 名称。opener 丢失时继续保留同源 Storage/BroadcastChannel 通道；存储或 BroadcastChannel 不可用时保留有效 postMessage 路径。不新增自动重试，不改变业务动作或服务端权限判断。

**完成信号仍然只是同源 UI 提示，不是签名凭据，也不是强身份绑定的 attempt token。** 它不能替代 BFF 对真实会话、近期 MFA、角色和授权版本的校验；本批不宣称解决所有并行窗口/COOP 导航或恶意同源脚本问题。

## 验证与收口规则

本地 Node 22 仅运行了实际 TypeScript helper 的 17 项确定性定时/事件验证，并完成浏览器测试脚本语法检查；无法解析 github.com 拉取全仓库，因此不宣称在本地完成 Node 24、Vitest、Go、Docker 或 Chromium 全套验证。

新增 Vitest 覆盖完成/取消竞态、延迟信号、历史/异常时间、Storage 类型、来源约束、不可用通道、回调异常后的资源释放，以及真实 useSudoMode 的 Promise/activating 行为。新增三个 Chromium 测试使用真实弹窗与同源传输，但明确拦截 BFF 请求；它们不是实际 OIDC/MFA 验证演练。测试加入既有 Playwright testMatch，不移除原有测试。

最终以同一 PR head 的完整 CI、实际 PostgreSQL 必跑证据、三张镜像与双扫描、BFF 兼容、Showcase Parity 和全部 Chromium 测试结果验收，并将精确 run/artifact 记录在 PR。不得以改阈值、跳过、删除测试或修改认证状态换取通过。

#359、#338 继续保持开放；本批不替代剩余 React/HTTP 审计、授权操作员恢复演练、最终发布审计或生产部署。
