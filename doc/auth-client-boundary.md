# 身份客户端与业务请求边界

本文是 Blog、GOSSO Admin 与 `@gosso/client` 的长期架构约束。实现与本文冲突时，以当前公共契约和安全基线为准；历史审计记录仅用于追溯。

## 所有权

### `@gosso/client`

SDK 唯一负责 OAuth/OIDC、PKCE、身份 CSRF、Cookie/Token Session、刷新锁、登录与登出、统一身份错误，以及 Profile、密码、邮箱、MFA、Passkey、Session 和密码重置等账户自助协议。消费者不得复制端点、请求体、WebAuthn 编解码、响应 envelope 或刷新逻辑。

OAuth verifier 和 state 必须来自 Web Crypto。缺少 CSPRNG 时 SDK 明确失败，不写入 flow storage，也不发起跳转。刷新锁 owner 只是非安全的并发标识，不得用于认证、Token 或 CSRF。

### Blog transport

`blog-frontend/src/api/client.ts` 是 Blog 唯一 transport：

- `authenticatedApiFetch` 将已认证请求交给 SDK；
- `optionalApiFetch` 只表示身份可选，不吞掉网络、认证、HTTP 或解析错误；
- `publicApiFetch` 只处理 Blog 的同源匿名业务请求、`credentials: same-origin` 与 `blog_csrf_token`。

Blog 的 envelope 解析只在该文件发生。React 页面和组件只能调用 `postsApi`、`pagesApi`、`commentsApi`、`agentApi`、`workflowApi`、`connectorApi`、`operationsApi` 等领域 API，不得直接调用 transport。

### Admin services

GOSSO Admin 的管理员账号、OAuth client、审计和系统状态属于管理域，继续由 Admin service 层负责。用户自己的 Profile、密码、邮箱、MFA、Passkey、Session 和密码重置属于 SDK。

### React 页面

页面只拥有展示、表单校验、交互和本地化状态。协议地址、请求体、Cookie、Token、CSRF、envelope 与认证错误分类不属于页面职责。

`/admin/*` 由应用根部的单一访问门禁控制：它通过 Blog 的
`/api/me/blog-session` 读取后端已验证的 JWT `roles`，仅 `admin` 角色可以渲染
后台框架。Blog 仍会请求 `admin` scope 以取得 GOSSO 签发的角色声明，但 OAuth
scope 和页面自身的 profile 缓存均不得作为授权依据。
前端门禁只避免暴露工作区；所有管理 API 仍必须由后端角色中间件拒绝未授权
请求。

## 会话与浏览器安全基线

- GOSSO 的浏览器会话使用 `__Host-access_token` 与
  `__Host-refresh_token`：两者均为 `Secure`、`HttpOnly`、path 为 `/` 的
  host-only Cookie；访问令牌使用 `SameSite=Lax`，刷新令牌使用
  `SameSite=Strict`。
- 刷新令牌必须在每次刷新时原子轮换，并启用重放检测、撤销和审计；Blog 不得
  自行持久化、复制或解析刷新令牌。
- Blog 所有不安全 HTTP 方法均要求同源双提交 CSRF token。令牌 Cookie 不是
  身份凭据，且在 HTTPS 环境必须设置 `Secure`。
- 浏览器入口的 CSP 必须以 `Content-Security-Policy`（不是
  `Report-Only`）强制发送，并至少限制脚本为 `script-src 'self'`。当前
  React 界面仍有动态 style 属性，故 `style-src 'unsafe-inline'` 是有意且
  暂时的兼容项；新增内联脚本一律禁止。

## 依赖与发布

公开发布只接受 npm registry 中的精确 SemVer（当前验证版本为
`@gosso/client@0.4.0`）及 lockfile integrity，不接受 Git branch、Git SSH URL
或浮动版本。消费者依赖更新必须晚于 SDK 稳定版发布，并在无 SSH 凭据的
干净目录中通过 `npm ci`。

当前整改分支使用 trusted publisher 发布的稳定 SDK 验证跨仓契约。
生产镜像同时必须固定 version 与 digest；SDK 的 breaking change 必须按
SemVer 提供迁移说明。

## 兼容策略

各仓库独立使用 SemVer，并通过兼容性矩阵记录可组合版本。SDK 0.4 默认
Cookie Session、callback 判别联合与 token 仅内存保存属于已记录的迁移项；
Blog 内部 import path 不属于发布 API。
