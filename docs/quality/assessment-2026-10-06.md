# 代码质量与安全评估：2026-10-06

本次评估从 `9a0925b4`（`chore(deps): finalize dependency and deployment baseline`）起持续复核，并以 2026-10-06 收口 PR #332 的最新验证 HEAD 为最终事实源。评估覆盖后端、Seed、前端、Playwright、Docker Compose、GitHub Actions、镜像供应链、模块完整性和敏感配置边界。

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


### 镜像扫描首次落地发现与处置

PR #332 首次对 frontend runtime 镜像执行 Trivy 后，旧 `nginx:stable-alpine@sha256:dc5069ad...` 被阻断，发现 **9 个可修复 HIGH / 0 CRITICAL**：

- `libexpat`：`2.8.4-r0`，CVE-2026-93990，修复版本 `2.8.5-r0`；
- `libuuid/util-linux`：`2.42.1-r0`，包含 CVE-2026-53612/53613/53614/76642/78408/78409/78410，修复线为 `2.42.3-r0/r1`；
- `pcre2`：`10.48-r0`，CVE-2026-103111，修复版本 `10.49-r0`。

本轮没有降低扫描阈值或增加忽略项，而是将 frontend runtime 的 Nginx immutable digest 更新为当前 `stable-alpine` index digest `sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94`，并继续针对剩余可修复包做显式版本修复。


第二次扫描验证显示，更新到当前 Nginx immutable digest 后，原来的 9 个 HIGH 已降至 **2 个可修复 HIGH / 0 CRITICAL**：仅剩 `libexpat 2.8.4-r0 -> 2.8.5-r0` 与 `pcre2 10.48-r0 -> 10.49-r0`。因此在 frontend runtime 层显式安装并锁定 `libexpat=2.8.5-r0`、`pcre2=10.49-r0`。随后 PR Images run `37481262167` 中 backend / frontend / seed 三张镜像全部同时通过 Trivy 与 Grype，未降低 HIGH/CRITICAL 阻断阈值。


### 最终技术门禁证据

在技术变更 HEAD `01278d5046dfd74bcf78d9c35832141beb010675` 上完成以下正式验证：

- **CI `37481262300`：SUCCESS**
  - Backend quality：Go 1.27.1，module verify、tests/coverage、race、vet、govulncheck 全部成功；
  - Seed quality：tests、vet、module verify、govulncheck 成功；
  - Frontend quality：Node 24.x 环境下 `npm ci`、`npm audit`、`npm run quality` 成功；
  - Isolated database integration、Dependency review、Compose config、Image publish contract 全部成功。
- **Images `37481262167`：SUCCESS**
  - backend / frontend / seed 均完成多架构 Docker build；
  - 三张镜像均通过 Trivy 和 Grype 的 fixable HIGH/CRITICAL 阻断式扫描。
- **Gosso Release BFF Compatibility `37481262153`：SUCCESS**。
- **Blog Showcase Parity `37481262324`：SUCCESS**
  - fresh paired evidence artifact `11422440290`；
  - SHA-256 `3b1f85efa588f36b32758bce8937e13b3471411bf5b804b01c7db87feb4bf900`；
  - current Gouno UI main ref `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`。
- **UI Browser Acceptance `37481262325`：SUCCESS**
  - full rendered Playwright acceptance；
  - artifact `11422060992`；
  - SHA-256 `5b62655704fbea7d6dcb5cc643f7ae8c7a03b1bb33e6b3edb755344770081a60`。

基于 fresh source review + rendered parity + full browser evidence，`blog-public-account` 与 `blog-admin-core-wave3` 的 MarkdownRenderer 安全变更已恢复为 `verified`，没有通过放宽视觉、认证或安全规则来“做绿”。

### 保留风险 / 后续质量债

本轮没有把以下已确认但不构成当前 release gate failure 的事项与镜像安全收口混在一起重写：

- Frontend oxlint 当前仍约 **74 warnings / 0 errors**，主要集中在 effect 内同步 setState、Hook 依赖数组、render purity/ref、Fast Refresh 混合导出，以及少量 unused/escape；其中 Connector Workspace 受 Connector Module Hold 保护，不在本轮修改。
- Vite 主入口 chunk 仍约 **856.37 kB**（gzip 约 **268.34 kB**），超过 500 kB warning line；后续应按路由/功能域分阶段 code-splitting，并对涉及的认证 Product path 重新走 Showcase parity。
- 控制器错误映射仍存在若干直接向 4xx 响应透出 `err.Error()` 的历史实现；已有 `controllerutil.WriteDomainError` 中央映射，但要按 domain 逐组迁移并补 API 契约测试，不能在安全收口中批量替换。Connector controller 不得因该项破坏 Module Hold。
- `GO-2026-5932` 仍只存在于 required module 的不可达 `golang.org/x/crypto/openpgp` 路径；govulncheck 仍为 0 个可达漏洞，且当前无可用上游修复版本。


### PR #332 最新 HEAD 最终复核

在最新验证 HEAD `b4b59d43ef14018491bc0f285533024fad5f00a7` 上再次执行完整相关门禁，结果如下：

- **CI `37483970444`：SUCCESS**
  - Backend 使用 **Go 1.27.1**；`go mod verify`、tests/coverage、`go test -race ./...`、`go vet ./...`、govulncheck 全部通过。
  - govulncheck：**0 个代码可达漏洞、0 个 imported-package 漏洞、1 个 required-module 不可达提示**；该模块级提示继续对应既有 `GO-2026-5932` 跟踪项。
  - Seed quality、Isolated database integration、Dependency review、Compose config、Image publish contract 全部通过。
  - Frontend runner 为 **Node v24.21.0**，满足 `>=24.15 <25`；`npm ci`、`npm audit --audit-level=moderate`、`npm run quality` 全部通过，59/59 test files、243/243 tests 成功。
- **Images `37483970606`：SUCCESS**
  - backend / frontend / seed 三张镜像均完成 amd64/arm64 build；
  - 三张镜像的本地扫描镜像均同时通过 **Trivy + Grype** fixable HIGH/CRITICAL 阻断门禁；
  - frontend 旧 runtime 曾暴露的 9 个 fixable HIGH 已通过已记录的 Nginx immutable digest 更新和显式 `libexpat=2.8.5-r0` / `pcre2=10.49-r0` 修复消除，没有增加 CVE ignore，也没有降低 severity threshold。
- **Gosso Release BFF Compatibility `37483970743`：SUCCESS**，Confidential BFF / OIDC 发布兼容边界保持成立。
- **Blog Showcase Parity `37483970528`：SUCCESS**
  - paired evidence artifact `11423365528`
  - SHA-256 `ed93416c243e9730c32c3220b72f3bdd105cca75f7a07fa08cabfe5a8f779a6e`
  - manual-first certification ledger、AI Settings / AI Operations source parity、canonical rendered comparison 全部通过。
- **UI Browser Acceptance `37483970621`：SUCCESS**
  - full rendered Playwright acceptance 通过；
  - artifact `11422713571`
  - SHA-256 `3ac57a8feda654e6e19084f0bb16df4b6ea734a6980cff70d9a6d1b734853693`。

最终确认的非阻断剩余风险没有被本轮伪装成“已解决”：

- Frontend oxlint 仍为 **74 warnings / 0 errors**；其中包含 effect 同步 setState、Hook dependency、render purity/ref、Fast Refresh、unused/escape 等类型。应按页面/功能域分批修复并重新走对应 parity，Connector Workspace 继续受 Connector Module Hold 保护。
- Vite 主入口仍为 **856.37 kB**（gzip **268.34 kB**），超过 500 kB warning line；应后续按依赖/路由边界做受控 code-splitting，不在本次安全收口中盲目拆包。
- 控制器仍有若干历史 4xx 路径直接使用 `err.Error()`；应围绕 `controllerutil.WriteDomainError` 分 domain 收敛并补 API 契约测试，禁止借此修改 Connector 产品行为。
- `GO-2026-5932` 当前仍无可用修复版本且调用不可达，继续跟踪上游依赖移除路径。

边界复核：本轮没有修改 Connector 产品行为，没有放松 Confidential BFF / HttpOnly Secure SameSite session / OIDC identity 校验，没有改变 canonical `@gouno/ui` registry 依赖；生产 Compose 继续对一方镜像要求显式 immutable digest，本地入口仍只使用标准 443/80，没有引入 8443。
