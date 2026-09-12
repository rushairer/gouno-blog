# blog-backend

`blog-backend` is the Go backend of [gouno-blog](https://github.com/rushairer/gouno-blog). It was bootstrapped with Gouno and now owns its application architecture and project-specific Codegen policy.

Gouno provides reusable project/runtime mechanisms and the Codegen protocol. The choices in this backend—Gin, Cobra, Viper, PostgreSQL, Redis, and Capability Module organization—belong to this project; they are not mandatory Gouno Core architecture.

## Features

- **Gin** HTTP application layer.
- **Cobra** project CLI.
- **Viper** configuration management.
- **Capability Module architecture** for complex business areas.
- Graceful shutdown and production-oriented runtime behavior.
- Project-owned Gouno Codegen v1 policy under `.gouno/`.
- Make targets for common development tasks.

## Installation and Running

### Prerequisites

- Go 1.25.0 or newer. The module currently pins the Go 1.26.6 toolchain.
- Git.

### Clone Project

```bash
git clone https://github.com/rushairer/gouno-blog.git
cd gouno-blog/blog-backend
```

### Build Project

```bash
make build
```

### Run Web Service

```bash
./bin/gouno web --config ./config/config.yaml --address 0.0.0.0 --port 8080
```

Command-line options are owned by the project commands under `cmd/gouno/`; use `./bin/gouno <command> --help` as the current source of truth.

### Development Mode

```bash
make dev
```

## Project-owned Codegen

`blog-backend` uses the Gouno Codegen v1 runtime, but the available generators are defined by this project in `.gouno/codegen.yaml`.

```bash
./bin/gouno gen --help
./bin/gouno gen module article_revision
```

The `module` generator creates a conservative Capability Module skeleton:

```text
internal/article_revision/
├── domain/article_revision.go
├── repository/article_revision_repository.go
├── service/article_revision_service.go
└── controller/article_revision_controller.go
```

It intentionally does not generate database queries, routes, migrations, dependency injection, cross-capability imports, security policy, or a mandatory `module.go`. Add only the layers and wiring the real capability needs; unused generated layers should be removed rather than kept for symmetry.

The upstream/default `suite` generator is not redefined by this project. Capability generation uses the distinct project-owned `module` command.

## Architecture

For this complex backend the primary ownership boundary is a business capability, with implementation layers inside that capability:

```text
internal/
├── page/
│   ├── domain/
│   ├── repository/
│   ├── service/
│   └── controller/
├── agent/
├── media/
├── knowledge/
├── authbff/
└── ...
```

The historical global `internal/service` bucket has already been retired. `internal/domain` remains a deliberate shared-model migration boundary, while `internal/repository` and `internal/controller` are transitional migration buckets. Existing capabilities are migrated incrementally; new business ownership should prefer capability-local packages.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the authoritative project convention and the repository root [AGENTS.md](../AGENTS.md) for security and migration invariants.

## Common Makefile Commands

- `make build`: build the backend binary.
- `make run`: run the development server.
- `make dev`: run in hot-reload development mode.

## Configuration

Configuration is project-owned and loaded through Viper. Refer to the files under `config/` and the repository-level environment examples for the current deployment contract.

## Testing

The repository CI is the final quality gate. Backend changes are expected to pass unit/coverage checks, the race detector, `go vet`, `govulncheck`, isolated database integration, and the unaffected monorepo gates required by the root workflow.

## Contribution

Follow the repository root [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md). Architecture changes must preserve the confidential BFF/security contract and the Connector Module Hold.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

# blog-backend 中文说明

`blog-backend` 是 [gouno-blog](https://github.com/rushairer/gouno-blog) 的 Go 后端。项目最初由 Gouno 启动，现在由项目自身负责应用架构和 Codegen Policy。

Gouno 提供可复用的项目/运行时机制以及 Codegen 协议；本项目选择的 Gin、Cobra、Viper、PostgreSQL、Redis 和 Capability Module 架构，都属于 `gouno-blog` 的工程策略，并不是 Gouno Core 对所有项目的强制要求。

## 特性

- **Gin** HTTP 应用层。
- **Cobra** 项目 CLI。
- **Viper** 配置管理。
- 面向复杂业务的 **Capability Module** 架构。
- 优雅退出和生产环境运行机制。
- `.gouno/` 下由项目自己维护的 Gouno Codegen v1 Policy。
- 常用开发任务的 Makefile 命令。

## 安装与运行

### 前置要求

- Go 1.25.0 或更高版本；当前模块固定 Go 1.26.6 toolchain。
- Git。

### 克隆项目

```bash
git clone https://github.com/rushairer/gouno-blog.git
cd gouno-blog/blog-backend
```

### 构建

```bash
make build
```

### 运行 Web 服务

```bash
./bin/gouno web --config ./config/config.yaml --address 0.0.0.0 --port 8080
```

CLI 参数由 `cmd/gouno/` 下的项目命令负责；当前可用参数以 `./bin/gouno <command> --help` 为准。

### 开发模式

```bash
make dev
```

## 项目自己的 Codegen

`blog-backend` 使用 Gouno Codegen v1 Runtime，但具体有什么 Generator 由本项目的 `.gouno/codegen.yaml` 定义。

```bash
./bin/gouno gen --help
./bin/gouno gen module article_revision
```

`module` 会创建最小的 Capability Module 骨架：

```text
internal/article_revision/
├── domain/article_revision.go
├── repository/article_revision_repository.go
├── service/article_revision_service.go
└── controller/article_revision_controller.go
```

它不会偷偷生成数据库查询、路由、Migration、DI、跨 Capability Import、安全策略、Connector 行为或强制的 `module.go`。真正实现业务时只保留该 Capability 实际需要的层，不要为了目录对称而长期保留空层。

本项目不会重定义上游/默认 `suite` 的语义；Capability Module 使用独立的项目级 `module` 命令。

## 架构

复杂 Blog 后端以业务 Capability 作为第一层 ownership boundary，再在 Capability 内部组织实现层：

```text
internal/
├── page/
│   ├── domain/
│   ├── repository/
│   ├── service/
│   └── controller/
├── agent/
├── media/
├── knowledge/
├── authbff/
└── ...
```

历史上的全局 `internal/service` 已经退役。`internal/domain` 仍是有意保留的共享模型迁移边界，`internal/repository` 与 `internal/controller` 则是渐进迁移目录。已有代码按完整 Capability 分批迁移；新的业务 ownership 应优先进入 Capability 自己的目录。

完整规则见 [ARCHITECTURE.md](./ARCHITECTURE.md)，安全和迁移不变量见仓库根目录 [AGENTS.md](../AGENTS.md)。

## 常用 Makefile 命令

- `make build`：构建后端。
- `make run`：运行开发服务。
- `make dev`：热更新开发模式。

## 配置

配置由本项目维护并通过 Viper 加载。当前配置结构以 `config/` 以及仓库根目录的环境变量示例为准。

## 测试

GitHub Actions 是最终质量门禁。后端修改需要通过单元测试/覆盖率、Race Detector、`go vet`、`govulncheck`、独立数据库 Integration，以及根工作流要求的其它未受影响 Monorepo Gate。

## 贡献

遵循仓库根目录 [CONTRIBUTING.md](../CONTRIBUTING.md) 和 [AGENTS.md](../AGENTS.md)。任何架构重构都不得绕过 Confidential BFF / Security Contract 或 Connector Module Hold。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE)。
