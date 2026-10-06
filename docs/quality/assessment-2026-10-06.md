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
