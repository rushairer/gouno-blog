# 代码质量与安全评估：2026-10-06

本次评估基于 `9a0925b4`（`chore(deps): finalize dependency and deployment baseline`）以及当前工作树中的依赖、安全和 CI 改动。评估覆盖后端、Seed、前端、Playwright、Docker Compose、GitHub Actions、模块完整性和敏感配置边界。

## 已完成的更新

- 本地 `main` 已快进到 `origin/main`，同步 24 个提交。Go 后端和 Seed 使用 Go 1.27.1 依赖基线；前端使用 Node 24 LTS、React 19.3、Vite 8.3、Vitest 5、TypeScript 7 CLI 与 TypeScript 6 AST 兼容别名。
- OIDC BFF 从 discovery 的 `revocation_endpoint` 获取撤销地址，并要求它与配置的 issuer 使用同一 HTTPS origin；未声明端点时拒绝静默调用硬编码路径。
- Markdown 链接和图片使用显式 URL 协议白名单，拒绝 `javascript:`、`data:`、`blob:` 等危险协议，并补充回归测试。
- Playwright E2E 依赖固定为 `1.63.0`，新增 `blog-frontend/e2e/package-lock.json`，工作流统一使用 `npm ci` 和独立依赖审计。该升级修复了 Playwright 浏览器下载完整性校验漏洞（GHSA-7mvr-c777-76hp）。
- CI 增加 Go 模块校验，Seed Dockerfile 增加 `go mod verify`，govulncheck 固定到 v1.6.0 的不可变提交 `19b0bb6a272792b9afa8a6983c3e9b9a1816947f`，npm 审计覆盖开发依赖并把阈值提高到 moderate。
- Dependabot 已覆盖独立 E2E npm 项目；Pull Request 验证模板同步使用不可变 govulncheck 提交。

## 验证结果

| 范围 | 结果 |
| --- | --- |
| Go 后端 | `go test ./...`、`go test -race ./...`、`go vet ./...` 通过；总语句覆盖率 26.8%；`secretbox` 88.7%、`provider` 78.7%、`authbff` 51.3% |
| Seed | `go test ./...`、`go vet ./...`、`go mod verify` 通过 |
| Go 供应链 | 后端和 Seed `go mod verify` 通过；govulncheck 显示 0 个代码可达漏洞 |
| 前端 | `npm run quality` 通过：59 个测试文件、243 个测试；Statements 61.1%、Branches 52.66%、Functions 51.77%、Lines 63.4%；UI/CSS 合约、Vite 构建和 51 个静态 chunk 循环检查通过 |
| npm 依赖 | Blog 主依赖和 E2E Playwright 依赖的已记录在线审计均为 0 漏洞；本次复核的离线审计同样为 0；`@gouno/ui` 0.4.9、`@gosso/client` 0.9.3 保持精确 registry 锁定 |
| Compose/部署 | 三套 Compose 配置、认证部署契约、生产 digest 契约通过；镜像构建计划测试 17/17；数据库门禁单元测试 7/7 |
| E2E | Playwright 1.63.0 可列出 344 个测试（9 个文件）；实际浏览器执行需要允许本地 webServer 监听和 Chromium 运行的 CI/非沙箱环境 |

govulncheck 仍报告 `GO-2026-5932`：`golang.org/x/crypto/openpgp` 未维护且存在已知问题，但该包未被项目代码调用，当前版本没有修复版本（Fixed in: N/A）。它属于不可达的模块级提示，不构成当前可达代码漏洞；应在后续依赖审计中持续跟踪上游移除路径。

## 风险与后续事项

以下项目没有阻断本次更新，但应纳入后续质量迭代：

- Dockerfile 的 `apk add` 未锁定 Alpine 包版本；基础镜像已使用 digest，发布流程已生成 SBOM 和签名，仍建议增加 Trivy/Grype 基础镜像扫描。
- 部分控制器把已知输入校验错误直接返回给客户端；需要继续收敛到统一错误映射，避免未来把数据库或上游错误透出。
- `OptionalBlogAccess` 对公共 API 的缺失或无效 BFF claims 按匿名处理，这是公开内容路径的既定行为；新增路由必须使用强制 `BlogAccess`，不能复用可选中间件保护管理操作。
- Gemini 模型名由本地管理配置控制，当前请求目标仍限定在已校验的上游 origin；后续可增加模型标识符字符约束，减少路径格式错误。
- 前端 lint 仍有既存 React effect、依赖数组、Fast Refresh 和无用变量警告；构建还提示入口 chunk 约 856 kB，应安排拆包和警告收敛。
- 本次本地前端门禁使用 Node 24.12.0；项目引擎约束为 `>=24.15 <25`，因此 CI 必须使用 Node 24.15 或更高的 Node 24 版本。
- 本机 Docker daemon 不允许当前沙箱访问，因此真实数据库集成、Docker build、容器运行时扫描和浏览器 webServer 运行未在本地完成；这些门禁仍需在 CI 复核。
- 当前环境重新执行 `npm outdated --all` 时网络查询未返回结果；依赖版本以已锁定的清单和 CI 在线审计为准，后续应在联网 CI 中继续检查新的上游版本。

本次改动没有修改 Connector 产品行为，认证仍由 Blog BFF 的 HttpOnly Secure SameSite 会话和 Redis 生命周期负责。


## 2026-10-06 收口复核补充

以远端 `main` 精确提交 `8a2310add7e69b108b68f823145fbafd942b4c37` 为基线重新核验 GitHub Actions 证据：

- **CI** `37471084889` 成功：GitHub runner 使用 Node `24.21.0`，满足项目 `>=24.15 <25` 引擎约束；后端/Seed 的测试、race、vet、`go mod verify`、govulncheck，数据库集成、前端 `npm ci` / `npm audit` / `npm run quality`、Compose 与部署契约均通过。
- **UI Browser Acceptance** `37471084862` 成功，完整 Playwright 浏览器验收已在可用浏览器环境中执行；证据 artifact `11416809057`，SHA-256 `081dc94dc13f560fe9e7a12d4273e3289ca5c1a941e69c12fc228705d64426f8`。
- **Publish Images** `37471084903` 成功：backend/frontend/seed 均完成 amd64/arm64 构建、推送、digest 记录、签名和 SBOM。该基线工作流仍缺少漏洞扫描，因此本轮新增 Trivy + Grype 双扫描门禁。
- **Blog Showcase Parity** `37471084845` 失败，原因不是渲染测试失败，而是 `MarkdownRenderer.tsx` 安全修复使 `blog-public-account` 与 `blog-admin-core-wave3` 的 manual-first certification 按治理规则变为 stale。已在 PR #332 中显式降级为 `needs-manual-recertification`，并补充安全差异人工复核；待 fresh Showcase parity 证据后才能恢复 `verified`。

本轮确认并处理的镜像供应链问题：

- backend / seed Dockerfile 的 Alpine `apk add` 改为显式版本：`ca-certificates=20260909-r0`、`tzdata=2026e-r0`。首次 PR Docker 验证发现 Alpine 在线仓库已从网页缓存记录的 `2026d-r0` 更新为 `2026e-r0`，最终锁定值以实际 Docker daemon 的仓库解析结果为准；
- PR 镜像新增 SHA 固定的 Trivy `v0.36.0` 与 Grype/Anchore Scan `v7.4.2` 双扫描，fixable HIGH/CRITICAL 漏洞阻断合并；
- 发布镜像在 GHCR push 后按 `image@sha256:...` 精确 digest 再扫描，随后才进入签名与 SBOM 交付；
- 新增 `.github/scripts/test_image_security_contract.py`，防止 scanner、digest 扫描或 Alpine package pin 被后续改动静默移除。

仍需继续收敛但不在本次供应链修复中盲目改动的前端质量债：

- 当前 `npm run quality` 为 **0 errors / 74 warnings**，主要是 React effect 同步 setState、依赖数组、render purity/ref、Fast Refresh 与少量 unused/escape 警告；
- 当前主入口 chunk 为 `856.37 kB`（gzip `268.34 kB`），Vite 仍提示超过 500 kB；
- 这些问题已确认存在，但修复会触及多个已认证 Product owned paths，必须按页面/功能成组处理并重新走 Showcase parity，而不是在安全收口 PR 中批量重写。

govulncheck 复核仍为 **0 个可达漏洞**；`GO-2026-5932` 只存在于 required module 的不可达 `golang.org/x/crypto/openpgp` 路径，当前无上游修复版本，继续作为依赖移除风险跟踪项。
