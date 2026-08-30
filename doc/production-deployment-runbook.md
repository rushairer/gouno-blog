# GOSSO / Blog OIDC 独立域拆分生产部署与运维手册

本文档为 `sso.io84.com`（GOSSO 认证平台）与 `blog.io84.com`（Personal Blog BFF）独立域拆分的生产部署操作指南与应急回滚手册。

---

## 1. 部署前准备清单（Pre-flight Checklist）

### A. 域名解析（DNS）
在 DNS 解析服务商处配置以下记录（指向生产服务器公网 IP）：

| 主机记录 | 类型 | 目标值 | 用途 |
|---|---|---|---|
| `sso` | A / AAAA | `<生产服务器IP>` | GOSSO 认证平台与 Admin UI |
| `blog` | A / AAAA | `<生产服务器IP>` | 个人博客 BFF 与前端 SPA |
| `cms` | A / AAAA | `<生产服务器IP>` | 预留 CMS 域名 |
| `@` (`io84.com`) | A / AAAA | `<生产服务器IP>` | 旧生产域名（保留 14 天平滑过渡） |

### B. 生产密钥生成
在安全环境或生产服务器上生成运行期密钥：

```bash
# 1. 生成 Blog BFF Google Tink AEAD 密钥集
mkdir -p /opt/gouno-blog/secrets
cd /Users/aben/Git/gouno-blog/blog-backend
go run ./cmd/main.go bff-keygen --out /opt/gouno-blog/secrets/blog-bff-tink.json
chmod 600 /opt/gouno-blog/secrets/blog-bff-tink.json

# 2. 生成 Blog BFF 客户端通信密钥文件 (Client Secret File)
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
LEGACY_DOMAIN=io84.com
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
docker compose --env-file /opt/gouno-blog/.env.production -f docker-compose.production-split.yml up -d
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

## 5. 应急回滚手册（10 分钟切流恢复）

若上线过程中出现不可预期的严重异常，可随时执行 10 分钟回滚流程恢复至旧同源单域栈：

### 5.1 回滚前置条件验证

```bash
# 验证 legacy 环境配置文件存在
test -f /opt/gouno-blog/.env.legacy && echo "OK: .env.legacy exists" || echo "MISSING: .env.legacy"

# 验证 legacy 镜像仍然可用
docker image inspect $(grep GOSSO_IMAGE /opt/gouno-blog/.env.legacy | cut -d= -f2) >/dev/null 2>&1 && echo "OK: gosso image" || echo "MISSING: gosso image"
docker image inspect $(grep GOUNO_BLOG_BACKEND_IMAGE /opt/gouno-blog/.env.legacy | cut -d= -f2) >/dev/null 2>&1 && echo "OK: blog-backend image" || echo "MISSING: blog-backend image"

# 验证旧版 Caddyfile 存在
test -f /opt/gouno-blog/Caddyfile.production && echo "OK: Caddyfile.production exists" || echo "MISSING: Caddyfile.production"
```

### 5.2 回滚执行步骤

```bash
# 步骤 1: 停止拆分栈容器
docker compose -f docker-compose.production-split.yml down

# 步骤 2: 重新启动旧版生产单域栈
docker compose --env-file /opt/gouno-blog/.env.legacy -f docker-compose.production.yml up -d

# 步骤 3: 验证旧站点恢复
curl -fsSL https://io84.com/api/auth/session
```

> **注意**：由于数据库迁移采用 **additive 模型**（仅新增 `blog_principal_identities` 别名表），回滚时**无需降级数据库**，旧版服务可直接兼容运行。

### 5.3 数据库与 Redis 备份恢复

#### 备份（部署前必做）

```bash
# 1. 数据库备份
mkdir -p /opt/gouno-blog/backups
docker exec sso-blog-db pg_dumpall -U postgres > /opt/gouno-blog/backups/db-backup-$(date +%Y%m%d%H%M%S).sql

# 2. Redis 持久化快照（如果 Redis 已开启 AOF，可直接拷贝 appendonly 文件）
docker exec sso-blog-redis redis-cli -a "$REDIS_PASSWORD" SAVE
docker cp sso-blog-redis:/data /opt/gouno-blog/backups/redis-backup-$(date +%Y%m%d%H%M%S)

# 3. 密钥文件备份
cp -r /opt/gouno-blog/secrets /opt/gouno-blog/backups/secrets-backup-$(date +%Y%m%d%H%M%S)
```

#### 恢复验证

```bash
# 1. 验证备份文件完整性
ls -lh /opt/gouno-blog/backups/

# 2. 恢复数据库（在回滚后验证旧数据可访问）
# docker exec -i sso-blog-db psql -U postgres < /opt/gouno-blog/backups/db-backup-YYYYMMDDHHMMSS.sql

# 3. 验证密钥文件可读
test -r /opt/gouno-blog/secrets/gosso_private.pem && echo "OK: signing key" || echo "MISSING: signing key"
test -r /opt/gouno-blog/secrets/blog-bff-tink.json && echo "OK: tink keyset" || echo "MISSING: tink keyset"
```

### 5.4 回滚计时记录模板

每次回滚演练必须记录实际计时：

| 步骤 | 目标时间 | 实际时间 | 备注 |
|------|----------|----------|------|
| 验证前置条件 | 1 分钟 | | |
| 停止拆分栈 | 1 分钟 | | |
| 启动旧版栈 | 3 分钟 | | |
| DNS 切换（如需） | 2 分钟 | | |
| 健康检查验证 | 1 分钟 | | |
| **总计** | **≤10 分钟** | | |

### 5.5 回滚演练频率

- 每次生产变更前必须完成一次完整回滚演练
- 演练记录存档至少 30 天
- 演练必须使用实际生产环境配置（非模拟环境）

---

## 6. 浏览器兼容性验证矩阵

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
