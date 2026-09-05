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
`/api/me/blog-session` 读取 Blog 后端的本地成员资格、角色和权限摘要；只有具备
`site.manage` 权限的成员可以渲染完整后台框架。Blog 只请求最小 OAuth scope
`openid profile email`；OAuth scope、SSO 全局角色和页面 profile 缓存均不得作为
Blog 授权依据。前端门禁只避免暴露工作区；所有管理 API 仍必须由后端本地授权
中间件拒绝未授权请求。

Blog 以不可变的 `(issuer, subject)` 投影 SSO 身份；成员资格、固定角色
`owner/admin/editor/author/moderator`、权限版本和授权审计均保存在 Blog 数据库。
首次 Owner 只能由部署时明确配置的 issuer/subject 在带有已验签 SSO `admin` 角色
时原子建立，之后 SSO 角色不会改变 Blog 权限。角色授予、暂停和 Owner 转移必须
同时通过近期 MFA 校验。Blog BFF 只在已经完成 OIDC 验签的交互式授权回调中读取
`auth_time` 与 `amr`，并把符合强认证方法且仍在 10 分钟窗口内的结果写成独立、
AEAD 加密且按 Blog session handle 绑定的短期 MFA freshness evidence。授权中间件
只消费这份 BFF-owned evidence；refresh token 换取的新 ID token 即使再次携带
`auth_time`/`amr`，也不得建立或延长 Blog 的敏感操作 freshness。缺失、过期或不满足
强认证方法时必须拒绝敏感操作并要求重新 step-up，绝不降级放行。缺失 Owner 时仅允许
受控的本地 `gouno owner-recover --issuer … --subject … --reason … --confirm` 恢复路径。

## 会话与浏览器安全基线

- GOSSO 身份域可以维护自己的中心 SSO Cookie；Blog 不共享 `.io84.com` 顶级域
  Cookie，也不得依赖 GOSSO Cookie 作为 Blog 业务授权凭据。
- Blog 浏览器只持有本域 `Secure`、`HttpOnly`、host-only 的不透明 BFF session
  handle 与非身份型 CSRF Cookie。浏览器 JavaScript、localStorage、sessionStorage、
  IndexedDB 和可读 Cookie 均不得持有 access token、refresh token 或 ID token。
- OAuth authorization code、token exchange、refresh、userinfo 与 revoke 均由 Blog
  confidential BFF 在服务端完成。BFF 可以为维持 Blog 会话而在服务端保存 access、
  refresh 与 ID token，但这些 provider token 必须留在服务端受保护存储中，并使用
  server-side encryption/AEAD，不得投影给浏览器。
- refresh token 如发生轮换，BFF 必须原子替换服务端 session 记录，并与并发 logout
  竞争时 fail closed。refresh 只影响 provider token/session 状态，不得刷新 Blog 的
  Recent MFA freshness evidence。
- Blog 所有不安全 HTTP 方法均要求同源双提交 CSRF token。令牌 Cookie 不是身份凭据，
  且在 HTTPS 环境必须设置 `Secure`。
- 浏览器入口的 CSP 必须以 `Content-Security-Policy`（不是 `Report-Only`）强制发送，
  并至少限制脚本为 `script-src 'self'`。当前 React 界面仍有动态 style 属性，故
  `style-src 'unsafe-inline'` 是有意且暂时的兼容项；新增内联脚本一律禁止。
- 用户上传 SVG 属于主动内容边界：上传阶段必须限制为受控静态 SVG 子集，生产 `/media/*.svg`
  响应必须使用独立的 restrictive CSP/sandbox，不能继承普通 Blog 页面脚本策略。

## 依赖与发布

公开发布只接受 npm registry 中的精确 SemVer 与 lockfile integrity，不接受 Git branch、
Git SSH URL 或浮动版本。当前验证版本以各消费者 `package.json` 与 `package-lock.json`
的 exact-version + registry tarball + integrity 契约为唯一事实来源，文档不再复制一个
容易漂移的版本号。消费者依赖更新必须晚于 SDK 稳定版发布，并在无 SSH 凭据的干净目录中
通过 `npm ci`。

生产镜像同时必须固定 version 与 digest；SDK 的 breaking change 必须按 SemVer 提供迁移
说明。Blog、GOSSO Admin 与 `@gosso/client` 的跨仓身份契约变更必须同时执行各自 quality
checks 与 Blog authentication deployment contract。

## 兼容策略

各仓库独立使用 SemVer，并通过兼容性矩阵记录可组合版本。Cookie Session、callback 判别
联合、PKCE、zero-token browser 与 BFF session 都属于跨仓身份契约；Blog 内部 import path
不属于发布 API。任何改变 Cookie 名称/SameSite、callback、scope、ACR、MFA step-up、refresh
或 logout 语义的 SDK 版本升级，都必须作为身份边界变更进行回归，而不能只按普通 npm 依赖
升级处理。
