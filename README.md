# Gouno Blog — 原生受控 AI Agent 的开源博客运营系统

Gouno Blog 是一个构建于 GoUno 与 GOSSO 的开源、自托管博客运营系统。它包含前端 SPA、后端 API、博客网关，以及本地开发用的身份服务与管理控制台编排。

除常规内容发布外，项目将 AI Agent 原生嵌入博客后台：运营者可以配置模型 Provider、Agent、受限工具与定时任务；Agent 的写入操作以提案形式进入人工审批，并保留运行、工具调用、用量与审批审计记录。它面向的是可治理的博客运营自动化，而不是绕过人工直接发布的黑盒机器人。

## ✨ AI Agent 核心能力

- **原生运营工作流**：在 `/admin/ai-ops` 集中管理 Provider、Agent、Workflow、Cron 任务和运行历史，无需依赖外部自动化平台。
- **受控执行**：支持 OpenAI 兼容与 Anthropic Provider、模型与预算边界、工具白名单、上游访问策略及限流。
- **人工在环**：涉及内容写入的动作先生成提案，由具备权限的管理员审核、批准或拒绝。
- **可审计可追溯**：持久化 Agent Run、工具调用、Token 用量、审批决定与操作人，便于复盘与治理。
- **密钥安全**：Provider 密钥加密存储；删除 Provider 时主动撤销其持久化凭据。

---

## 🏗️ 架构设计

跨仓库的身份 SDK、Blog transport、Admin service 与 React 页面职责见 [`doc/auth-client-boundary.md`](doc/auth-client-boundary.md)。该文档是长期边界；带日期的审计报告仅作为历史快照。

系统采用“业务应用轻依赖身份提供商”的架构。`gouno-blog` 不包含 GOSSO 或 GOSSO Admin 源码，也不把它们作为 Git 子模块；本地完整集群通过已发布 Docker 镜像接入，业务代码只通过 OIDC/OAuth2 和 JWKS 与身份服务交互。

* **Caddy HTTPS Gateway (`https://localhost:8443`)**：统一网关入口。
  - `/` -> **blog-frontend** (React SPA 门户)
  - `/api/` -> **blog-backend** (GoUno 博客后端)
  - `/swagger/` -> **Swagger UI & OpenAPI Spec** (API 接口文档)
  - `/identity-admin/` -> **gosso-admin-frontend** (GOSSO 身份管理控制台)
  - `/api/v1/`、`/oauth2/`、`/oidc/`、`/.well-known/` -> **gosso**
* **GOSSO / OIDC Provider**：负责登录、授权码流程、Token 签发、MFA、Passkey 等身份能力；唯一登录 UI 由 `/identity-admin/login` 下的 GOSSO 托管前端提供，业务前端不实现凭据表单。本地默认使用 `ghcr.io/rushairer/gosso` 镜像。
* **blog-backend**：博客 API 后端，使用 `gouno` Web 框架开发，向身份服务拉取 JWKS 公钥并校验登录凭证与用户权限；内置受控 AI Agent Runner、Workflow 引擎、Cron Scheduler、Blog Tools 与人工审批。
* **blog-frontend**：基于 React 构建的单页面应用（SPA），提供门户展示、`/admin` 博客管理控制台和 `/admin/ai-ops` AI 运营控制台。

---

## 📂 目录结构

```text
├── .gitignore
├── README.md                  # 本文档
├── retrospective.md           # 前后端 SSO 集成开发指南与最佳实践
├── docker-compose.yml         # 镜像化本地集群编排配置
├── docker-compose.source.yml  # 本地源码构建 override
├── docker-compose.production.yml # 生产部署编排配置
├── Caddyfile                  # Caddy HTTPS 反向代理配置
├── doc/                       # 架构边界、AI 工作台和发布记录
├── init.sql                   # 数据库初始化脚本
├── seed/                      # 博客 OAuth client 一次性初始化镜像
├── scripts/                   # 本地 TLS 等辅助脚本
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

### 3. 初始化本地 HTTPS 证书

本地网关只提供 HTTPS。先安装 [mkcert](https://github.com/FiloSottile/mkcert)（macOS 可使用 `brew install mkcert`），再生成并信任 `localhost` 证书：

```bash
./scripts/setup-local-tls.sh
```

该脚本生成的证书和私钥保存在 `certs/`，不会提交到 Git。需要覆盖默认路径时，将 `LOCAL_TLS_CERT_FILE` 和 `LOCAL_TLS_KEY_FILE` 写入本地 `.env`；可从 `.env.example` 开始。

### 4. 启动本地完整业务集群

默认 compose 会启动 blog、GOSSO、GOSSO Admin、PostgreSQL、Redis、Mailpit 和统一网关，并自动注册博客前端 OAuth client：

- Client ID：`blog-spa`
- Redirect URI：`https://localhost:8443/callback`
- Scopes：`openid profile email`

GOSSO Admin 使用独立 OAuth client 和 Redirect URI：`https://localhost:8443/identity-admin/callback`。GOSSO 的 `login_url` 指向 `https://localhost:8443/identity-admin/login`；Blog 不提供 `/login` 路由。Blog 前端通过 `@gosso/client` 使用 `__Host-*` HttpOnly Cookie 会话；访问与刷新 Token 不会写入浏览器可读存储。它仍使用授权码 + PKCE，并只在 `sessionStorage` 中临时保存 PKCE 状态和最小化的界面授权信息。

无感切换依赖统一网关下的 GOSSO 中心登录态：用户登录 `identity-admin` 后访问 `/admin`，blog 会发起 `/oauth2/authorize`。如果 GOSSO cookie 中的中心会话仍有效，GOSSO 会直接回调 `/callback` 并建立 Blog Cookie 会话，用户无需再次输入账号密码。

后端管理接口仍由 blog 后端执行权限校验；当前默认要求 Access Token 中包含 `roles: ["admin"]`。

```bash
docker compose up -d
```

该开发编排将所有宿主机端口绑定到 `127.0.0.1`，避免将开发账号、数据库、Redis 或 Mailpit 意外暴露到局域网。如需通过其他主机访问，请在部署环境中显式覆盖端口映射并配置生产凭据。

启动后，容器运行状态如下：
* `sso-blog-gateway` (Caddy HTTPS, 监听端口 `8443`)
* `sso-blog-frontend` (前端 SPA)
* `sso-blog-backend` (后端 API, 监听端口 `8082`)
* `sso-blog-gosso` (GOSSO 身份服务)
* `sso-blog-gosso-admin-frontend` (GOSSO Admin 身份管理控制台)
* `sso-blog-gosso-admin-seed` / `sso-blog-client-seed` (一次性数据初始化任务)
* `gouno-blog-blog-media-init-1`（一次性命名卷属主初始化任务；仅具备 `CHOWN` capability）
* `sso-blog-db` (PostgreSQL 15 数据库)
* `sso-blog-redis` (Redis 缓存在线 Session)
* `sso-blog-mailpit` (本地邮件测试)

自建服务镜像（`ghcr.io/rushairer/*`）默认使用浮动的 `main` 标签，并设置了 `pull_policy: always`：各仓库推送到 `main` 后，镜像会以 `main`、`sha-<commit>` 标签发布，发布 `v*` 时再追加版本标签。本地开发只需 `docker compose up -d` 即会拉取最新 `main` 镜像，无需手改摘要或额外 `pull`。第三方基础镜像（PostgreSQL、Redis、Mailpit、Caddy）仍固定不可变摘要以保证可复现。

生产编排使用完整的不可变镜像引用；以 `vX.Y.Z@sha256:<digest>` 覆盖对应变量：

```bash
export GOUNO_BLOG_BACKEND_IMAGE=ghcr.io/rushairer/gouno-blog-backend:vX.Y.Z@sha256:...
export GOUNO_BLOG_FRONTEND_IMAGE=ghcr.io/rushairer/gouno-blog-frontend:vX.Y.Z@sha256:...
export GOUNO_BLOG_SEED_IMAGE=ghcr.io/rushairer/gouno-blog-seed:vX.Y.Z@sha256:...
export GOSSO_IMAGE=ghcr.io/rushairer/gosso:vX.Y.Z@sha256:...
export GOSSO_ADMIN_FRONTEND_IMAGE=ghcr.io/rushairer/gosso-admin-frontend-identity-admin:vX.Y.Z@sha256:...
export GOSSO_ADMIN_SEED_IMAGE=ghcr.io/rushairer/gosso-admin-seed:vX.Y.Z@sha256:...
```

如果需要从当前 checkout 构建 blog 前后端源码，使用 source override：

```bash
docker compose -f docker-compose.yml -f docker-compose.source.yml up -d --build
```

`blog-client-seed` 与 `gosso-admin-seed` 一样是一次性数据初始化容器；默认使用 `ghcr.io/rushairer/gouno-blog-seed` 镜像，本地 source override 会从根目录 `seed/` 构建该镜像。`blog-media-init` 会在后端启动前，以唯一的 `CHOWN` capability 将命名卷调整为固定的 `10001:10001`，随后退出；常驻后端仍以该非 root UID/GID 运行。

后端会在数据库可用后才通过 `/healthz` 就绪检查；前端会等待该检查成功，避免容器刚启动时将请求转发到尚未完成数据库初始化的 API。

### 5. 访问测试
- 打开浏览器访问门户：[https://localhost:8443/](https://localhost:8443/)
- 访问博客后台管理（触发 SSO 登录流）：[https://localhost:8443/admin](https://localhost:8443/admin)
- 访问 AI 运营控制台：[https://localhost:8443/admin/ai-ops](https://localhost:8443/admin/ai-ops)
- 访问 GOSSO 身份管理控制台：[https://localhost:8443/identity-admin](https://localhost:8443/identity-admin)
- 访问 API Swagger 文档：[https://localhost:8443/swagger](https://localhost:8443/swagger)
- 使用本地默认管理员账户登录：
  - 用户名：`admin`
  - 密码：`admin123`
- 登录成功后，如果服务端会话包含 blog 管理所需角色，即可在博客后台发布和管理文章。
- 已登录 GOSSO 身份管理控制台后再次访问博客后台，会通过同一身份中心会话静默完成 blog 授权码流程；若 Blog 会话过期，SDK 会通过受保护的 Cookie 刷新流程恢复会话。

### 6. 使用外部身份服务

如需让 `gouno-blog` 连接外部 OIDC/GOSSO，而不是本地 compose 内的 `gosso`，可以覆盖以下配置，并按需停用本地身份相关服务：

```bash
export VITE_GOSSO_ISSUER=http://localhost:8088
export SSO_JWKS_URL=http://host.docker.internal:8088/.well-known/jwks.json
export SSO_TOKEN_ISSUER=http://localhost:8088
export SSO_CLIENT_ID=blog-spa
```

### 7. 多语言与国际化 (i18n)

博客前端已支持中英文（zh/en）国际化：
- **首选语言自适应**：系统默认会根据浏览器语言自动加载对应的语言界面（中文或英文）。
- **语言手动切换**：在设置界面或首页侧边栏，你可以自由在“English”和“简体中文”之间切换，并且切换记录会被保存在浏览器的本地存储（Local Storage）中，以便在下一次访问时继续生效。

### 8. 社区互动

- 匿名评论默认进入审核队列；通过 GOSSO 登录的读者使用账号展示名并可直接参与讨论。
- 评论支持两级回复、举报与跨文章统一审核；登录用户会收到评论回复的站内通知。
- 点赞按登录用户或签名访客标识去重并支持取消；登录用户还可以跨设备收藏文章。
- 评论、点赞和举报使用 Redis 限流。生产环境必须设置高强度随机值 `BLOG_VISITOR_SECRET`，用于签名匿名访客 Cookie。

### 9. 内容增长工具

- 文章详情页自动生成 description、Open Graph、canonical 与 BlogPosting 结构化数据，并按标签展示相关阅读。
- 后台提供内容数据看板，汇总文章、浏览、点赞、收藏、评论、审核和举报数据。
- 媒体库支持 JPEG、PNG、WebP、GIF（单文件最大 10 MB），上传后可直接复制 Markdown；容器内文件通过 `blog_media` 卷持久化。
- 文章每次内容变更都会自动保留数据库快照，后台最多展示最近 50 个版本并支持恢复。恢复前的当前版本也会被保留。
- 媒体默认存储在本地文件系统，可用 `BLOG_MEDIA_DIR` 修改目录；也可设 `BLOG_MEDIA_STORAGE=s3` 切换到 S3 兼容对象存储。S3 模式要求 `BLOG_MEDIA_S3_BUCKET`、`BLOG_MEDIA_S3_REGION`、`BLOG_MEDIA_S3_PUBLIC_BASE_URL`，可选 `BLOG_MEDIA_S3_ENDPOINT`（MinIO 等）和 `BLOG_MEDIA_S3_PREFIX`；凭据使用标准 AWS 环境变量或运行时角色。对象 URL 必须由受控的公开 CDN 或 Bucket 域名提供。

### 10. AI Agent 博客运营

后台将 Provider Profile 和 Agent 作为数据库资源管理，无需修改 YAML 即可配置：

- Provider：支持 OpenAI Responses API 和 Anthropic Messages API；API Key 使用 AES-256-GCM 加密落库，读取接口只返回是否已配置和尾号。删除 Provider 会立刻清除密文；历史 Agent Run 保留审计记录，但不能再使用该凭据。
- Agent：可选择 Provider、模型、手动或 Cron 周期、IANA 时区、Blog Tool 能力、执行步数、每日运行上限和月度 token 预算。
- 运行中心：记录运行状态、输出摘要、模型、token 用量和每次 Tool Call。
- 审批箱：所有文章、标签和评论回复变更只能形成提案；管理员批准后才通过现有 Blog Service 执行。模型没有直接发布或删除路径。
- 内容再利用：Agent 可为社媒、newsletter、FAQ 和图片创意生成审批草稿；首版仅供审阅和复制，不保存第三方凭据、不连接外部平台、更不会自动投递。
- 媒体候选：图片 brief 审批与生成全流程已接入 AI 工作流中心（Run 详情），支持模型调用生成、真实图片预览、重新生成、多图位置编排（封面 / 正文插图锚点）及版本审计应用；媒体库专注于媒体资源的管理与引用。
- 模板：内置“每周运营报告”“内容健康巡检”“评论洞察与回复草稿”三个可复制模板。

### AI 请求与 Workflow 执行超时

普通 API 使用 `web_server.request_timeout` （默认 10 秒）。需在 HTTP 请求内等待模型结果的 Provider 测试、文本生成、Workflow 草案和索引操作使用 120 秒；直接生图使用 300 秒。后端 `write_timeout` 配置为 6 分钟，以覆盖最长的同步请求。如果部署在反向代理或网关之后，它的上游超时也必须不小于 300 秒。

`/api/admin/ai-workflows/:id/run`、`dry-run` 与重试接口仅创建保存的队列 Run 并返回 `202 Accepted`；实际执行由后台 Worker 进行。Cron 和事件触发也由服务启动时初始化的 Scheduler 入队，因此不受这些同步 HTTP 超时的限制。

本地 Compose 默认启用模块，并使用仅供开发的固定主密钥。生产部署应生成独立密钥并显式启用：

```bash
export BLOG_AGENT_MASTER_KEY="$(openssl rand -base64 32)"
export GOUNO_AI_AGENTS_ENABLED=true
docker compose up -d
```

默认部署采用同源 API，不开放跨域访问。若前端确实部署在不同的受信任 Origin，请在后端运行配置的 `web_server.cors_allowed_origins` 中逐项列出完整 Origin（例如 `https://console.example.com`）；不要使用通配符。未列入名单的跨源写请求会被拒绝。

生产镜像不再内置 Blog 数据库 DSN。启动后端必须提供 `GOUNO_DATABASE_DRIVERS_POSTGRES_DSN`；Compose 为本地开发临时生成该值，初始化任务也会使用同一个 `BLOG_POSTGRES_PASSWORD`。部署时应至少设置独立的 `BLOG_POSTGRES_PASSWORD`、`GOUNO_DATABASE_DRIVERS_POSTGRES_DSN`、`BLOG_VISITOR_SECRET`、至少 32 字符的 `GOUNO_AI_WEBHOOK_SECRET` 和 Agent 主密钥，推荐使用平台的 Secret 管理能力，而不是提交 `.env` 文件。生产环境启用 AI Agent 而未配置有效 Webhook 密钥时会拒绝启动。

`BLOG_AGENT_MASTER_KEY` 解码后必须恰好为 32 字节。生产配置默认关闭 Agent，且启用时缺少有效主密钥会拒绝启动。主密钥轮换时，提升 `BLOG_AGENT_MASTER_KEY_VERSION`，并暂时通过 `BLOG_AGENT_PREVIOUS_MASTER_KEYS` 保留旧版本：

```bash
export BLOG_AGENT_MASTER_KEY_VERSION=2
export BLOG_AGENT_MASTER_KEY="<new-base64-key>"
export BLOG_AGENT_PREVIOUS_MASTER_KEYS="1:<old-base64-key>"
```

旧密钥只用于解密旧记录，新保存的 Provider Key 会使用当前版本。管理员重新保存所有 Provider 凭据后即可移除旧密钥；丢失仍在使用的旧密钥会导致对应 Provider 无法运行。

第三方公网 Provider 无需预先加入名单：只要域名解析结果全部为公网地址并使用 HTTPS，即可直接保存。Clash/Mihomo 等代理为域名返回的 `198.18.0.0/15` Fake-IP 也受支持，但直接填写该网段的 IP 仍不会被视为公网。`ai_agents.allowed_upstream_hosts` 用于显式授权自托管、局域网或本机 Provider；本地开发时，名单内的回环地址也可以使用 HTTP。链路本地、metadata、未指定和组播地址始终禁止，DNS 会在保存及每次建连时重新校验，上游重定向也会被拒绝。

结构化输入、运行范围、自动化路线和发布边界参见 [AI 工作台自动化设计](./doc/ai-workbench-automation-plan.md)；管理 API 可在 Swagger 的 `/admin/ai-workflows`、`/admin/ai-resources/{type}` 和 `/admin/ai-workflow-runs/{id}/resources` 下查看。

### 11. 多架构与 ARM64 支持

发布工作流使用 Docker Buildx 构建 `linux/amd64` 和 `linux/arm64` 多平台镜像并推送至 GHCR。本地 Compose 不强制 `platform`，由 Docker 选择当前主机架构的镜像。

---

## 📘 开发者集成指南

在基于该架构进行深入的前后端业务开发时，请务必阅读：
👉 [GOSSO & GoUno 前后端集成开发指南与最佳实践](./retrospective.md)

主要内容包括：
1. 同源网关的路由配置要点。
2. 后端服务如何动态读取 JWKS 校验 Access Token 以及实现 RBAC。
3. 前端 SPA 对 Base64Url JWT 的健壮解码方案与防无限重定向实践。

## 开发与生产部署边界

根目录 `docker-compose.yml` 仅用于本地开发，其中的固定凭据和浮动
`main` 镜像不得用于生产。生产部署使用 `docker-compose.production.yml`，
所有应用与第三方镜像都必须以 `version@sha256:digest` 提供，所有密码、
签名密钥、TOTP key、pepper、数据库 DSN 和 Agent key 都必须显式设置。

生产身份链路有两个不可省略的部署契约：GOSSO 的
`GOUNO_AUTH_LOGIN_URL` 固定为 `/identity-admin/login`。Blog 不提供 `/login`
路由，所有 Client 必须通过 GOSSO 的授权端点进入统一登录页；不要添加
Blog 或网关层的 `/login` 兼容跳转，否则错误配置可能再次形成认证循环。
`GOSSO_TRUSTED_PROXIES` 必须是
仅包含实际反向代理容器网络的精确、逗号分隔 CIDR 列表；不要沿用与运行时
Docker/Podman 网络不匹配的默认网段，否则所有访问者会共享代理 IP 的
认证限流额度。CI 的 `Authentication deployment contract` 检查会同时
校验生产 Compose、Blog 路由和本段文档。

公开发布和安全报告分别遵循 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
与 [SECURITY.md](./SECURITY.md)。完整仓库采用 [MIT License](./LICENSE)。
