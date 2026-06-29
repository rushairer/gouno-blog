# Gouno Blog (基于 GOSSO & GoUno)

这是一个基于 OIDC 单点登录（SSO）架构的个人博客系统 Demo。项目包含前端 SPA、后端 API 和博客网关；身份提供商（例如 GOSSO）作为外部服务通过配置接入。

---

## 🏗️ 架构设计

系统采用“业务应用轻依赖身份提供商”的架构。`gouno-blog` 不包含 GOSSO 源码，也不直接写入 GOSSO 数据库；它只通过 OIDC/OAuth2 和 JWKS 与外部身份服务交互。

* **Nginx Gateway (`localhost:8080`)**：统一网关入口。
  - `/` -> **blog-frontend** (React SPA 门户)
  - `/api/` -> **blog-backend** (GoUno 博客后端)
* **外部 GOSSO / OIDC Provider**：负责登录、授权码流程、Token 签发、MFA、Passkey 等身份能力。
* **blog-backend**：博客 API 后端，使用 `gouno` Web 框架开发，向身份服务拉取 JWKS 公钥并校验登录凭证与用户权限。
* **blog-frontend**：基于 React 构建的单页面应用（SPA），提供门户展示与 `/admin` 博客管理控制台。

---

## 📂 目录结构

```text
├── .gitignore
├── README.md                  # 本文档
├── retrospective.md           # 前后端 SSO 集成开发指南与最佳实践
├── docker-compose.yml         # 本地容器编排配置
├── nginx-gateway.conf         # Nginx 反向代理配置
├── init.sql                   # 数据库初始化脚本
├── blog-backend/              # 博客后端微服务 (GoUno)
└── blog-frontend/             # 博客前端门户 (React)
```

---

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/rushairer/gouno-blog.git
cd gouno-blog
```

### 2. 准备外部身份服务
运行前需要有一个可访问的 GOSSO/OIDC Provider，并注册博客前端 OAuth client：

- Client ID：`blog-spa`
- Redirect URI：`http://localhost:8080/callback`
- Scopes：`openid profile email`

后端管理接口仍由 blog 后端执行权限校验；当前默认要求 Access Token 中包含 `roles: ["admin"]`。

### 3. 启动本地容器化环境
默认示例假设外部身份服务公开在 `http://localhost:8088`，容器内可通过 `host.docker.internal:8088` 读取 JWKS。可按需覆盖：

```bash
export VITE_GOSSO_ISSUER=http://localhost:8088
export VITE_GOSSO_CLIENT_ID=blog-spa
export SSO_JWKS_URL=http://host.docker.internal:8088/.well-known/jwks.json
export SSO_TOKEN_ISSUER=http://localhost:8088
export SSO_CLIENT_ID=blog-spa

docker compose up -d --build
```

启动后，容器运行状态如下：
* `sso-blog-gateway` (Nginx, 监听端口 `8080`)
* `sso-blog-frontend` (前端 SPA)
* `sso-blog-backend` (后端 API, 监听端口 `8082`)
* `sso-blog-db` (PostgreSQL 15 数据库)
* `sso-blog-redis` (Redis 缓存在线 Session)

### 4. 访问测试
- 打开浏览器访问门户：[http://localhost:8080/](http://localhost:8080/)
- 访问博客后台管理（触发 SSO 登录流）：[http://localhost:8080/admin](http://localhost:8080/admin)
- 使用外部身份服务中的管理员账户登录。
- 登录成功后，如果 token 中包含 blog 管理所需角色，即可在博客后台发布和管理文章。

如需同时联调 `gouno-blog`、`gosso` 和 `gosso-admin`，请使用隔壁独立部署项目：
```bash
cd ../gouno-cluster-deploy
docker compose up -d
```
集群模式会额外挂载 GOSSO 身份管理控制台：[http://localhost:8080/identity-admin](http://localhost:8080/identity-admin)。

如果需要从相邻源码仓库构建联调，请在部署项目中使用：
```bash
docker compose -f docker-compose.yml -f docker-compose.source.yml up -d --build
```

---

## 📘 开发者集成指南

在基于该架构进行深入的前后端业务开发时，请务必阅读：
👉 [GOSSO & GoUno 前后端集成开发指南与最佳实践](./retrospective.md)

主要内容包括：
1. 同源网关的路由配置要点。
2. 后端服务如何动态读取 JWKS 校验 Access Token 以及实现 RBAC。
3. 前端 SPA 对 Base64Url JWT 的健壮解码方案与防无限重定向实践。
