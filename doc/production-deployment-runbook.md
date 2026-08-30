# GOSSO / Blog OIDC 独立域拆分生产部署与运维手册

本文档为 `sso.io84.com`（GOSSO 认证平台）与 `blog.io84.com`（Personal Blog BFF）独立域拆分的生产部署操作指南。

---

## 1. 部署前准备清单（Pre-flight Checklist）

### A. 域名解析（DNS）
在 DNS 解析服务商处配置以下记录（指向生产服务器公网 IP）：

| 主机记录 | 类型 | 目标值 | 用途 |
|---|---|---|---|
| `sso` | A / AAAA | `<生产服务器IP>` | GOSSO 认证平台与 Admin UI |
| `blog` | A / AAAA | `<生产服务器IP>` | 个人博客 BFF 与前端 SPA |
| `cms` | A / AAAA | `<生产服务器IP>` | 预留 CMS 域名 |
| `@` (`io84.com`) | A / AAAA | 按既有站点策略 | 不是本次 SSO / Blog 发布的认证入口 |

### B. 生产密钥生成
在安全环境或生产服务器上生成运行期密钥：

```bash
# 1. 生成 Blog BFF Google Tink AEAD 密钥集
mkdir -p /opt/gouno-blog/secrets
cd /Users/aben/Git/gouno-blog/blog-backend
go run ./cmd/main.go bff-keygen --out /opt/gouno-blog/secrets/blog-bff-tink.json
chmod 600 /opt/gouno-blog/secrets/blog-bff-tink.json

# 2. 生成 GOSSO TOTP 加密密钥与验证 pepper
openssl rand -hex 32 > /opt/gouno-blog/secrets/gosso_totp_key
openssl rand -hex 32 > /opt/gouno-blog/secrets/gosso_verify_pepper
chmod 600 /opt/gouno-blog/secrets/gosso_totp_key /opt/gouno-blog/secrets/gosso_verify_pepper

# 3. 生成 Blog BFF 客户端通信密钥文件 (Client Secret File)
openssl rand -hex 32 > /opt/gouno-blog/secrets/blog_oauth_client_secret
chmod 600 /opt/gouno-blog/secrets/blog_oauth_client_secret
```

---

## 2. 数据库迁移（零停机 Additive 迁移）

在生产 Postgres 数据库中执行 additive 迁移脚本（不会破坏或删除任何现有数据）：

```bash
docker exec -i sso-blog-db psql -U postgres -d blog < /Users/aben/Git/gouno-blog/blog-backend/internal/migrations/sql/083_add_principal_identity_aliases.sql
```

验证迁移状态：
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'blog_principal_identities';
```

---

## 3. 生产环境配置（.env.production）

参考模板创建生产配置文件 `/opt/gouno-blog/.env.production`：

```bash
# 基础域名
SSO_DOMAIN=sso.io84.com
BLOG_DOMAIN=blog.io84.com
PUBLIC_ORIGIN=https://sso.io84.com

# 镜像版本（生产环境严格要求使用发布镜像的不可变 SHA-256 Digest，禁止使用浮动 tag 如 :main）
GOSSO_IMAGE=ghcr.io/rushairer/gosso:v0.8.0@sha256:<GOSSO_DIGEST>
GOSSO_ADMIN_FRONTEND_IMAGE=ghcr.io/rushairer/gosso-admin-frontend:v0.6.0@sha256:<ADMIN_FRONTEND_DIGEST>
GOSSO_ADMIN_SEED_IMAGE=ghcr.io/rushairer/gosso-admin-seed:v0.6.0@sha256:<ADMIN_SEED_DIGEST>
GOUNO_BLOG_BACKEND_IMAGE=ghcr.io/rushairer/gouno-blog-backend:v1.0.0@sha256:<BLOG_BACKEND_DIGEST>
GOUNO_BLOG_FRONTEND_IMAGE=ghcr.io/rushairer/gouno-blog-frontend:v1.0.0@sha256:<BLOG_FRONTEND_DIGEST>
GOUNO_BLOG_SEED_IMAGE=ghcr.io/rushairer/gouno-blog-seed:v1.0.0@sha256:<BLOG_SEED_DIGEST>

# 数据库连接
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<SECURE_PASSWORD>
GOSSO_DATABASE_DSN=host=db user=postgres password=<SECURE_PASSWORD> dbname=gosso port=5432 sslmode=disable TimeZone=Asia/Shanghai search_path=public
BLOG_DATABASE_DSN=host=db user=postgres password=<SECURE_PASSWORD> dbname=blog port=5432 sslmode=disable TimeZone=Asia/Shanghai search_path=public
GOSSO_REDIS_DSN=redis://:<REDIS_PASSWORD>@redis:6379/0
BLOG_REDIS_DSN=redis://:<REDIS_PASSWORD>@redis:6379/1
# Back-channel logout SSRF 白名单（容器内私网直连时填写容器网段，如 172.21.0.0/16；公网 DNS 访问留空）
GOSSO_BACKCHANNEL_ALLOWED_CIDRS=

# OIDC 与 BFF 密钥（通过受限权限的 Secret 文件挂载）
BLOG_OIDC_CLIENT_ID=blog-bff
BLOG_OAUTH_CLIENT_SECRET_FILE=/opt/gouno-blog/secrets/blog_oauth_client_secret
GOSSO_SIGNING_KEY_FILE=/opt/gouno-blog/secrets/gosso_private.pem
GOSSO_TOTP_KEY_FILE=/opt/gouno-blog/secrets/gosso_totp_key
GOSSO_VERIFY_PEPPER_FILE=/opt/gouno-blog/secrets/gosso_verify_pepper
BLOG_BFF_TINK_KEYSET_FILE=/opt/gouno-blog/secrets/blog-bff-tink.json

# 管理员初始化
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<ADMIN_SECURE_PASSWORD>
ADMIN_DISPLAY_NAME="System Admin"
BLOG_BOOTSTRAP_OWNER_SUBJECT=c6ac32f3-3c48-46b5-bae8-f17c17116dc5
BLOG_VISITOR_SECRET=<32_BYTE_RANDOM_SECRET>
BLOG_AGENT_MASTER_KEY=<32_BYTE_BASE64_KEY>
GOUNO_AI_WEBHOOK_SECRET=<32_BYTE_RANDOM_SECRET>
```

---

## 4. 服务启动与验证

### 启动服务
```bash
docker compose --env-file /opt/gouno-blog/.env.production -f docker-compose.production.yml up -d
```

### 自动化冒烟测试（Smoke Test）
```bash
# 1. 验证 OIDC Discovery
curl -fsSL https://sso.io84.com/.well-known/openid-configuration | jq .

# 2. 验证 Blog BFF 未登录状态
curl -fsSL https://blog.io84.com/api/auth/me | jq .

# 3. 验证 Blog BFF 登录发起
curl -I "https://blog.io84.com/api/auth/login?return_to=/admin"
```

---

## 5. 浏览器兼容性验证矩阵

在进入生产灰度前，必须在以下浏览器环境中完成完整的 BFF 登录、本地退出、全局退出、back-channel logout 和 Passkey 验证：

| 浏览器 | 隐私模式 | 第三方 Cookie | 存储分区 | 验证状态 |
|--------|----------|---------------|----------|----------|
| Chrome (最新) | 普通/无痕 | 启用/禁用 | 启用/禁用 | |
| Firefox (最新) | 普通/隐私 | 启用/禁用 | 启用/禁用 | |
| Safari (最新) | 普通/无痕 | 启用/禁用 | 启用/禁用 | |

### 验证清单

- [ ] 未登录访问 `blog.io84.com/api/auth/me` → 返回未登录
- [ ] 点击登录跳转至 `sso.io84.com` 授权页
- [ ] 完成授权后回调至 `blog.io84.com` 并建立 BFF 会话
- [ ] 浏览器 DevTools 中无 access_token / refresh_token / id_token
- [ ] Cookie 仅包含 `__Host-Http-blog-session`，域为 `blog.io84.com`，无 `.io84.com` 顶级域 Cookie
- [ ] 本地 logout 清除 Blog BFF 会话，跳转至 SSO 确认页
- [ ] 全局 logout 清除 SSO 会话并触发 back-channel logout
- [ ] back-channel logout 成功清除 Blog BFF 会话
- [ ] Passkey 注册和验证正常（`sso.io84.com` RP ID）
- [ ] 多标签页同时刷新会话无冲突
