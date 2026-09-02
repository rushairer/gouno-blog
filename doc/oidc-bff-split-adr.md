# OIDC/BFF 独立域拆分决策

状态：已批准，实施中。生产变更仍需逐次批准。

## 标准边界

实现以 RFC 10017（Browser-Based Applications BCP）、RFC 9700（OAuth
Security BCP）、RFC 7636（PKCE）、RFC 8707（Resource Indicators）、RFC
9207（Authorization Response Issuer）、RFC 7009（Token Revocation）、OpenID
Connect Core、RP-Initiated Logout 1.0 和 Back-Channel Logout 1.0 Final 为规范。
协议解析、OAuth 客户端、OIDC discovery/JWKS/ID Token 验证使用成熟社区库；不建立
私有授权、Token、Logout 或浏览器会话协议。

## 信任边界

- `sso.example.com` 只持有 host-only 中心 SSO Cookie，提供 discovery、authorize、
  token、userinfo、JWKS、`/login`、账户功能和 `/admin`。
- Blog 是 confidential BFF。浏览器只持有 `blog.example.com` 的 Secure、HttpOnly、
  host-only opaque 业务会话 Cookie；OAuth Token 只保存在服务端。
- Blog 浏览器不跨域调用 token、userinfo、refresh、revoke 或身份 CSRF API。
- Blog 和 SSO 默认不为 BFF 流程开放 CORS。任何未来跨域浏览器能力必须使用精确
  origin allowlist 单独审查，禁止 `*` 与 credential 组合。
- Blog 权限只来自本地 membership/role。OIDC scope 和 GOSSO 管理角色不授予 Blog
  业务权限。

## Client 契约

- Flow：Authorization Code + PKCE S256；Client 认证为 `client_secret_basic`。
- Blog redirect URI：`https://blog.example.com/api/auth/callback`。
- Blog post-logout URI：`https://blog.example.com/api/auth/logout/callback`（及回退根路径 `https://blog.example.com/`）。
  RP-initiated logout 请求携带一次性 `state`，OP 在注销完成后重定向回 Blog 回调端点，
  BFF 原子消费并校验 `state` 防重放与防 CSRF，最后将浏览器重定向至 Blog 首页。
- Blog back-channel logout URI：
  `https://blog.example.com/api/auth/backchannel-logout`。
- Scope：`openid profile email`。
- RFC 8707 resource/audience：`https://blog.example.com/api`。
- CMS 使用独立 Client、secret、redirect URI、resource、权限和业务 Cookie。

## 迁移与身份连续性

- issuer 从 `https://example.com` 迁移到 `https://sso.example.com` 时，身份键始终是
  `(issuer, subject)`。即使 subject 文本相同，也不得自动合并；必须使用来自
  GOSSO 权威账户映射的显式、一对一、可审计批准。
- `blog_principal_identities` 以 additive 方式保存 identity alias。原
  `blog_principals.issuer/subject`、membership 和角色不改写、不删除。
- 通过受控的本地 `identity-alias-approve` 操作创建 alias；每次操作记录批准人和
  权威映射证据引用，冲突时原子失败。
- WebAuthn RP ID 最终迁移为 `sso.example.com`。旧 credential 保留，用户在密码/MFA
  验证后重新注册 Passkey。
- 独立域拆分是目标拓扑；不支持恢复为单域名部署。全局退出只结束当前中心 SSO
  session。“退出所有设备”是独立操作。
- 第一阶段复用身份数据库，不执行物理迁库。

## 本地拓扑门禁

开发环境使用 `sso.dev.local` / `sso.local.test`、`blog.dev.local` / `blog.local.test`、`cms.dev.local` / `cms.local.test` 与受信任 HTTPS，
以真实验证 host-only Cookie 和 origin 隔离。`Caddyfile` 与 `Caddyfile.production` 已全面作为标准默认配置固化。
