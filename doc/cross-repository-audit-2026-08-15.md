# Blog 关联仓库审计记录（2026-08-15）

范围为 `gouno-blog`、`gosso`、`gosso-admin` 与 `gosso-client`，聚焦浏览器认证、API 请求、网关信任边界、发布依赖和已确认无引用资源。

## 已确认问题与处置

| ID | 级别 | 证据 | 处置与责任仓库 |
| --- | --- | --- | --- |
| AUD-001 | P0（已缓解） | 发布地址 `v0.2.1` 的包缺少 cookie-session API，但 Blog 当前安装内容依赖该 API。 | `gosso-client@0.3.0` 已发布为独立不可变工件；Blog 与 Admin 均已在干净安装环境中锁定并验证该版本。不得覆盖旧发布工件。 |
| AUD-002 | P1（已缓解） | Admin 的 `authSession.ts` 重复实现 PKCE、刷新锁、CSRF、Passkey 与会话状态。 | Admin 已改为配置 `@gosso/client@0.3.0`，原实现已删除；两个消费者 CI 均验证锁文件中的 release URL、版本和完整性校验。 |
| AUD-003 | P1 | Blog 在 SDK 之外散落 `fetch`、CSRF cookie 解析和 envelope 解析。 | 统一到 `src/lib/api-client.ts`；认证请求仍由 SDK 负责，匿名社区请求复用同一 CSRF/credentials 规则。 |
| AUD-004 | P2 | `hero.png`、`react.svg`、`vite.svg` 与空的 `App.css` 无引用。 | 已从 Blog 前端移除；构建、UI 合约检查和测试覆盖确认无引用。 |
| AUD-005 | P2 | GOSSO 的 `/api/*`、Blog 的 `/posts/:slug` 与若干数据库字段存在兼容实现。 | 保留。删除前需在 CHANGELOG 标明最后支持版本、向消费者发出弃用通知，并以生产路由/数据使用量为零作为删除条件。 |

## 安全边界复核

- GOSSO 与 Blog 均采用 HttpOnly Cookie 会话；Blog 后端继续验证 issuer、audience、client 和管理员角色，前端判断只控制界面。
- Blog 后端的 CORS 仅允许显式 Origin 或同源，CSRF 保护 unsafe 请求；公开 AI webhook 使用独立 body HMAC 路径。
- 反向代理可信来源以公开 Host 为准，不接受可伪造的 `X-Forwarded-Host`。

## 发布门槛

1. 已发布 `@gosso/client@0.3.0`，未覆盖 `v0.2.1` 工件。
2. 已在 Admin 和 Blog 的干净 `npm ci` 环境中安装该精确版本并运行认证契约、类型、测试和构建。
3. 两个消费者锁文件现已固定该工件；后续可发布 Admin/Blog 镜像。GOSSO 与 Blog 后端仅在接口契约变化时发布。

## 整改落实（第二轮）

在首次审计基础上，关闭残留重复并清理遗留代码，各阶段独立提交并推送对应仓库 `main`：

- **Admin passkey 去重（关闭 AUD-002 残留）**：`PasskeysPanel` 的注册/列表/删除改走 `@gosso/client` 的 `registerPasskey`/`listPasskeys`/`deletePasskey`，删除自研 `utils/webauthn.ts` 及测试。（gosso-admin `1ab8efb`）
- **抽取共享 Go 包**：新增 `github.com/rushairer/gouno@v1.0.3`，提供 `auth`（JWKS 拉取 + RS256 校验）与 `middleware`（CSRF 原语、SecurityHeaders）；blog-backend 与 gosso 改为复用，仅保留各自策略（Bearer/cookie 提取、角色校验、skip 路径、CSP nonce 等）。（gouno `v1.0.3`、blog-backend `cca48a9`、gosso `c956643`）
- **清理死代码**：移除 blog-backend 的 gouno 生成器模板、render/verify 脚本、`.gitkeep` 占位与 goconvey target，`test` 改为 `go test ./...`；移除未引用资产 `public/icons.svg`。（blog-backend `b1b646f`、`7331798`）
- **统一前端方案**：blog 前端 i18n 改用 `i18next` + `react-i18next`（与 gosso-admin 一致）；手写正则高亮器替换为 `rehype-highlight`。（`e9f3411`、`02acf82`）
- **P3 清理**：gosso-admin 改用 `qrcode.react`（与 blog 一致）；移除 `readResponse` 别名，统一为 `readData`。（gosso-admin `febc1a0`、`e290a12`）

各仓库已在本地通过类型检查、单测（Go 单元测试 / Vitest）与构建验证。
