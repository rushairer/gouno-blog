# GOSSO & GoUno 前后端集成开发指南与最佳实践

本文档总结了在基于 **GOSSO (SSO 身份提供商)**、**GoUno (后端服务框架)** 以及 **React (前端 SPA)** 架构下进行前后端开发时的核心注意事项与最佳实践，帮助开发团队规避常见陷阱。

---

## 1. 架构选型：同源反向代理（Same-Origin Gateway）

在前后端分离的 SSO 架构中，前端 SPA、后端 API 以及 GOSSO 服务分别运行在不同的端口（或域名）上。直接进行跨域访问会遇到大量 CORS 问题以及浏览器对第三方 Cookie (Third-Party Cookies) 的严格限制。

### 最佳实践
* **统一入口网关**：强烈建议在前端与后端服务前架设一层轻量级网关（如 Nginx 或 Caddy），将所有服务聚合在同一个域名和端口下（例如通过端口 `8080` 统一分发）。
  - `/` -> 指向前端 SPA (`blog-frontend`)
  - `/api/` -> 指向后端 API (`blog-backend`)
  - `/api/v1/auth/` 等 -> 指向 SSO 登录及授权端点 (`gosso`)
* **使用相对路径**：前端代码中的 API 请求、SSO 的 `REDIRECT_URI` 均应使用相对路径（如 `/login`、`/api/v1/posts`），避免硬编码具体的 IP 或端口号，提高环境自适应能力。

---

## 2. 后端开发注意事项（GoUno 框架集成）

在开发后端微服务时，需要重点关注 Token 校验、权限控制与配置管理：

### A. JWT Token 验证与 JWKS 动态获取
* **动态 JWKS**：后端服务应通过 GOSSO 的 JWKS 接口（例如 `http://gosso:8080/.well-known/jwks.json`）动态拉取公钥来验证 JWT 签名，而不是把公钥硬编码在本地。
* **避免时钟偏差**：在校验 JWT 的 `exp`（过期时间）和 `nbf`（生效时间）时，应允许一定的时钟容差（建议 1-2 分钟），防止容器间系统时间微弱不同步导致请求被拒。

### B. 基于角色的权限控制 (RBAC)
* **开启角色下发**：确保 GOSSO 的配置文件中开启了 `auth.include_user_roles: true`，以便签发的 Access Token 中包含 `roles` 声明。
* **中间件拦截**：在后端路由中合理设计 Role 校验中间件，对于管理类 API 需严格校验 `claims["roles"]` 中是否包含 `admin` 等对应角色。

### C. CSRF 防御策略
* **Token-based 接口白名单**：对于依赖 `Authorization: Bearer <Token>` 请求头进行安全校验的 API 接口，无需开启 CSRF 校验（因为攻击者无法通过浏览器跨站请求自动附带自定义 Header）。
* **免登接口放行**：需要将认证接口（如 `/api/v1/auth/login`）或第三方 WebAuthn 校验端点加入 `web_server.csrf_skip_paths` 配置中，避免首屏访问或首次登录时被 CSRF 拦截。

---

## 3. 前端开发注意事项（React SPA 集成）

前端作为用户交互的第一入口，需保证登录态校验的健壮性与流畅的体验：

### A. 健壮的 JWT 解码器
* **Base64Url 填充处理**：JWT 的 Payload 部分是 Base64Url 编码（去除了 `=` 填充符）。原生浏览器的 `atob()` 函数对填充要求严格，直接调用会引发解码崩溃。
* **健壮解码方案**：前端解码时，必须对 Base64Url 格式进行字符替换（`-` -> `+`, `_` -> `/`）并在末尾自动补齐 `=` 填充符。
  ```typescript
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const payload = JSON.parse(atob(padded));
  ```

### B. 登录态管理与防无限重定向
* **双重校验**：前端路由守卫（Route Guard）在跳转登录前，应优先校验本地是否存在未过期的 Token。
* **跳转参数校验**：跳转到 SSO 登录页时需携带正确的 `redirect_uri`。成功登录重定向回来后，前端应立即安全解析 URL 中的 `code` 换取 Token 并清除 URL 里的敏感参数，防止用户刷新页面导致 code 重复提交报错。

---

## 4. 环境与配置隔离（Configuration-Driven）

无论是 GOSSO、GoUno 还是前端构建，都必须遵循配置与代码分离的原则：
* **敏感信息环境变量化**：数据库 DSN、Redis 连接串、JWT 私钥路径、Session 密钥等关键配置应通过环境变量传入（例如 Docker 容器的 `environment` 属性），切勿提交至 Git 仓库。
* **多环境配置文件**：利用 `development.yaml`、`production.yaml` 等对不同部署环境的特殊参数（如网关端口、Cookie 域名范围）进行精确管理。
