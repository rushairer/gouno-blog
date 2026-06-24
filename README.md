# SSO Demo System (基于 GOSSO & GoUno)

这是一个基于 OIDC 单点登录（SSO）架构的个人博客系统 Demo。项目整合了前端 SPA、后端 API、SSO 身份提供商（IdP）以及 Nginx 统一网关，展示了企业级单点登录系统的前后端全栈集成与部署方案。

---

## 🏗️ 架构设计

系统采用**同源反向代理网关**架构，规避了跨域（CORS）与浏览器第三方 Cookie 限制，具体拓扑如下：

* **Nginx Gateway (`localhost:8080`)**：统一网关入口。
  - `/` -> **blog-frontend** (React SPA 门户)
  - `/api/` -> **blog-backend** (GoUno 博客后端)
  - `/api/v1/auth/` 等 -> **gosso** (SSO 认证服务)
* **gosso (`submodule`)**：基于 OIDC/OAuth2 协议的统一身份认证服务，配合 PostgreSQL/Redis。
* **blog-backend**：博客 API 后端，使用 `gouno` Web 框架开发，向 `gosso` 拉取 JWKS 公钥并校验登录凭证与用户权限。
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
├── blog-frontend/             # 博客前端门户 (React)
└── gosso/                     # SSO 身份认证服务 (Git Submodule)
```

---

## 🚀 快速开始

### 1. 克隆项目与初始化子模块
因为项目引用了 `gosso` 作为 Git 子模块，克隆时请附带 `--recursive` 参数：
```bash
git clone --recursive <your-github-repo-url>
cd sso_demo
```
如果已经克隆了主仓库，可以通过以下命令初始化并拉取子模块：
```bash
git submodule update --init --recursive
```

### 2. 生成 GOSSO 签名密钥
SSO 服务需要一对 RSA 密钥来签发和验证 OIDC 令牌（JWT）。在运行容器前，在本地生成密钥对：
```bash
# 创建密钥目录
mkdir -p gosso/keys

# 生成 RSA 私钥（公钥会在运行时由 GOSSO 自动推导并以 JWKS 形式暴露）
openssl genpkey -algorithm RSA -out gosso/keys/private.pem -pkeyopt rsa_keygen_bits:2048
```

### 3. 启动本地容器化环境
使用 Docker Compose 一键编译并运行所有微服务组件：
```bash
docker compose up -d --build
```
启动后，容器运行状态如下：
* `sso-blog-gateway` (Nginx, 监听端口 `8080`)
* `sso-blog-frontend` (前端 SPA)
* `sso-blog-backend` (后端 API, 监听端口 `8082`)
* `sso-identity-provider` (GOSSO SSO 认证服务, 监听端口 `8080`)
* `sso-blog-db` (PostgreSQL 15 数据库)
* `sso-blog-redis` (Redis 缓存在线 Session)

### 4. 访问测试
- 打开浏览器访问门户：[http://localhost:8080/](http://localhost:8080/)
- 访问后台管理（触发 SSO 登录流）：[http://localhost:8080/admin](http://localhost:8080/admin)
- 登录默认管理员账户：
  - **用户名**：`admin`
  - **密码**：`password`
- 登录成功后，即可在后台发布和管理博客文章。

---

## 📘 开发者集成指南

在基于该架构进行深入的前后端业务开发时，请务必阅读：
👉 [GOSSO & GoUno 前后端集成开发指南与最佳实践](file:///Users/aben/Git/sso_demo/retrospective.md)

主要内容包括：
1. 同源网关的路由配置要点。
2. 后端服务如何动态读取 JWKS 校验 Access Token 以及实现 RBAC。
3. 前端 SPA 对 Base64Url JWT 的健壮解码方案与防无限重定向实践。
