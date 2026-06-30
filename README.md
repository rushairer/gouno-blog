# Gouno Blog (基于 GOSSO & GoUno)

这是一个基于 OIDC 单点登录（SSO）架构的个人博客系统 Demo。项目包含前端 SPA、后端 API、博客网关，以及本地开发用的 GOSSO 身份服务和 GOSSO Admin 镜像编排。

---

## 🏗️ 架构设计

系统采用“业务应用轻依赖身份提供商”的架构。`gouno-blog` 不包含 GOSSO 或 GOSSO Admin 源码，也不把它们作为 Git 子模块；本地完整集群通过已发布 Docker 镜像接入，业务代码只通过 OIDC/OAuth2 和 JWKS 与身份服务交互。

* **Nginx Gateway (`localhost:8080`)**：统一网关入口。
  - `/` -> **blog-frontend** (React SPA 门户)
  - `/api/` -> **blog-backend** (GoUno 博客后端)
  - `/swagger/` -> **Swagger UI & OpenAPI Spec** (API 接口文档)
  - `/identity-admin/` -> **gosso-admin-frontend** (GOSSO 身份管理控制台)
  - `/api/v1/`、`/oauth2/`、`/oidc/`、`/.well-known/` -> **gosso**
* **GOSSO / OIDC Provider**：负责登录、授权码流程、Token 签发、MFA、Passkey 等身份能力；本地默认使用 `ghcr.io/rushairer/gosso` 镜像。
* **blog-backend**：博客 API 后端，使用 `gouno` Web 框架开发，向身份服务拉取 JWKS 公钥并校验登录凭证与用户权限。
* **blog-frontend**：基于 React 构建的单页面应用（SPA），提供门户展示与 `/admin` 博客管理控制台。

---

## 📂 目录结构

```text
├── .gitignore
├── README.md                  # 本文档
├── retrospective.md           # 前后端 SSO 集成开发指南与最佳实践
├── docker-compose.yml         # 镜像化本地集群编排配置
├── docker-compose.source.yml  # 本地源码构建 override
├── nginx-gateway.conf         # Nginx 反向代理配置
├── init.sql                   # 数据库初始化脚本
├── seed/                      # 博客 OAuth client 一次性初始化镜像
├── keys/                      # 本地 GOSSO RSA 私钥目录（不提交）
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

### 2. 生成本地 GOSSO 签名密钥

```bash
mkdir -p keys
test -f keys/private.pem || openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
chmod 600 keys/private.pem
```

### 3. 启动本地完整业务集群

默认 compose 会启动 blog、GOSSO、GOSSO Admin、PostgreSQL、Redis、Mailpit 和统一网关，并自动注册博客前端 OAuth client：

- Client ID：`blog-spa`
- Redirect URI：`http://localhost:8080/callback`
- Scopes：`openid profile email`

后端管理接口仍由 blog 后端执行权限校验；当前默认要求 Access Token 中包含 `roles: ["admin"]`。

```bash
docker compose up -d
```

启动后，容器运行状态如下：
* `sso-blog-gateway` (Nginx, 监听端口 `8080`)
* `sso-blog-frontend` (前端 SPA)
* `sso-blog-backend` (后端 API, 监听端口 `8082`)
* `sso-blog-gosso` (GOSSO 身份服务)
* `sso-blog-gosso-admin-frontend` (GOSSO Admin 身份管理控制台)
* `sso-blog-gosso-admin-seed` / `sso-blog-client-seed` (一次性初始化任务)
* `sso-blog-db` (PostgreSQL 15 数据库)
* `sso-blog-redis` (Redis 缓存在线 Session)
* `sso-blog-mailpit` (本地邮件测试)

镜像 tag 可按需 pin 到不可变版本：

```bash
export GOUNO_BLOG_BACKEND_IMAGE_TAG=sha-...
export GOUNO_BLOG_FRONTEND_IMAGE_TAG=sha-...
export GOUNO_BLOG_SEED_IMAGE_TAG=sha-...
export GOSSO_IMAGE_TAG=sha-...
export GOSSO_ADMIN_FRONTEND_IMAGE_TAG=sha-...
export GOSSO_ADMIN_SEED_IMAGE_TAG=sha-...
```

如果需要从当前 checkout 构建 blog 前后端源码，使用 source override：

```bash
docker compose -f docker-compose.yml -f docker-compose.source.yml up -d --build
```

`blog-client-seed` 与 `gosso-admin-seed` 一样是一次性初始化容器；默认使用 `ghcr.io/rushairer/gouno-blog-seed` 镜像，本地 source override 会从根目录 `seed/` 构建该镜像。

### 4. 访问测试
- 打开浏览器访问门户：[http://localhost:8080/](http://localhost:8080/)
- 访问博客后台管理（触发 SSO 登录流）：[http://localhost:8080/admin](http://localhost:8080/admin)
- 访问 GOSSO 身份管理控制台：[http://localhost:8080/identity-admin](http://localhost:8080/identity-admin)
- 访问 API Swagger 文档：[http://localhost:8080/swagger](http://localhost:8080/swagger)
- 使用本地默认管理员账户登录：
  - 用户名：`admin`
  - 密码：`admin123`
- 登录成功后，如果 token 中包含 blog 管理所需角色，即可在博客后台发布和管理文章。

### 5. 使用外部身份服务

如需让 `gouno-blog` 连接外部 OIDC/GOSSO，而不是本地 compose 内的 `gosso`，可以覆盖以下配置，并按需停用本地身份相关服务：

```bash
export VITE_GOSSO_ISSUER=http://localhost:8088
export SSO_JWKS_URL=http://host.docker.internal:8088/.well-known/jwks.json
export SSO_TOKEN_ISSUER=http://localhost:8088
export SSO_CLIENT_ID=blog-spa
```

### 6. 多语言与国际化 (i18n)

博客前端已支持中英文（zh/en）国际化：
- **首选语言自适应**：系统默认会根据浏览器语言自动加载对应的语言界面（中文或英文）。
- **语言手动切换**：在设置界面或首页侧边栏，你可以自由在“English”和“简体中文”之间切换，并且切换记录会被保存在浏览器的本地存储（Local Storage）中，以便在下一次访问时继续生效。

### 7. 多架构与 ARM64 支持

为了支持在不同处理器架构（包括 Apple Silicon M1/M2/M3 等 ARM 设备）下流畅开发：
- **Docker Compose 配置**：在 `docker-compose.yml` 中，各服务的 platform 已经被明确配置，以防止在 ARM 架构设备上启动时产生不兼容的警告信息。
- **CI 多平台构建**：GitHub Actions 工作流已支持利用 Docker Buildx 自动并行构建 `linux/amd64` 和 `linux/arm64` 的多平台 Docker 镜像并推送至 GHCR。

---

## 📘 开发者集成指南

在基于该架构进行深入的前后端业务开发时，请务必阅读：
👉 [GOSSO & GoUno 前后端集成开发指南与最佳实践](./retrospective.md)

主要内容包括：
1. 同源网关的路由配置要点。
2. 后端服务如何动态读取 JWKS 校验 Access Token 以及实现 RBAC。
3. 前端 SPA 对 Base64Url JWT 的健壮解码方案与防无限重定向实践。
