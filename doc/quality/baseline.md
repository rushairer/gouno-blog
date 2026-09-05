# 质量评审基线：2026-09-05

这是一次代码抽样审阅与本地验证的历史记录，不代表完整渗透测试或生产验收。执行任务应重新确认当前代码；本轮计划文档没有重新运行下述业务测试。

## 仓库版本

用户要求更新相关项目后，五个工作区均执行 `git pull --ff-only`，当时均已是远端 main 最新版本，且工作区干净。

| 仓库 | 提交 |
| --- | --- |
| gouno-blog | cdc84aaa3f8f506adce9ee96ef7187f79dddbf58 |
| gosso | db6ed53 |
| gosso-admin | 7b475c1 |
| gosso-client | aa5c35e |
| gouno | 8d66a0b |

Blog 前端锁定 `@gosso/client 0.9.2`；Client 仓库提交描述为 0.9.3。源码更新不等于消费依赖升级。

## 已执行的本地检查

| 检查 | 结果与限制 |
| --- | --- |
| 后端 `go test -coverprofile=... ./...` | 通过，总语句覆盖率 22.9%；未提供数据库 DSN 的集成测试可跳过 |
| 后端 `go test -race ./...`、`go vet ./...` | 通过；不能证明被跳过的数据库路径 |
| Seed `go test ./...`、`go vet ./...` | 通过 |
| 前端 `npm run quality` | 格式、Lint、UI/CSS 契约、类型检查通过；测试 147/148，因标题断言失败终止，未执行该命令尾部构建 |
| 单独 PostDetail 测试 | 5/5 通过 |
| 第二次 `npm run test:coverage` | 148/148；语句 55.07%、分支 46.76%、函数 45.69%、行 57.18% |
| 单独 `npm run build` | 通过 |
| `npm audit --json` | 当时报告 0 个漏洞 |
| 后端 `govulncheck@v1.6.0` | 0 个代码可达漏洞；另有 4 个依赖模块层面漏洞，未显示被本代码调用 |

安全包语句覆盖率：authbff 50.7%、provider 64.6%、secretbox 88.7%。其他选例：repository 3.4%、workflow 11.0%、agent 8.8%。这些值来自未启用真实数据库集成的同一次运行；更换执行范围后不可直接混比。

本地临时日志当时保存在 `/tmp/gouno-blog-review-*`，不纳入 Git，也不保证长期存在。以上是人工记录，未来验收必须产生当前版本的证据，不能把临时日志当作可复现报告。

## 已确认的代码观察

- `.github/workflows/ci.yml` 未配置 `BLOG_TEST_POSTGRES_DSN`/Postgres 服务；集成测试具有缺失 DSN 时的 Skip 分支。
- CI 使用 `npm run check && npm run build`，另执行 `lint:ui`；`lint:css` 只包含在 `quality` 中，CI 未调用。
- `internal/repository/post_repository.go` 的文章更新只以 id 为条件，未校验编辑版本。
- 同文件公开列表 SELECT 包含 content 全文。
- 前端为静态 SPA 外壳，文章元信息在 `src/utils/seo.ts` 运行时设置。
- SEO Effect 使用 siteBrand，但依赖数组未包含该值；是否解释首次测试失败尚未查明。
- `main.tsx` 同时导入多份历史和对齐样式；已有 cascade layer 与检查机制，不能概括为无样式治理。

## 信号与待验证事项

大型文件包括 WorkflowWorkspace 2774 行、PostEditor 1811 行、PageEditor 1298 行、workflow/service.go 1815 行。行数表示审阅入口，不独立证明设计错误。

构建公共 CSS 195.40 kB（gzip 33.67 kB），入口 JS 315.91 kB（gzip 99.61 kB），另有 vendor/Markdown 等分包。这不是实际首屏流量或性能测量。

首次 PostDetail 标题断言得到空字符串，期望自定义文章标题；单测和全量复跑通过。只能认定观察到不稳定性，不能断言确定的线上故障或根因。

初评未运行浏览器视觉、移动端、屏幕阅读器、真实登录到发布 E2E、备份恢复演练或负载测试。访问本地 HTTPS 的 curl 因本地 CA 信任未成功；没有据此判断站点不可用。

已有 `doc/` 下架构文档，不能因不存在 `docs/` 而宣称缺少文档。计划编制时发现身份文档部分描述与当前代码待核对，另记到 Q05。

## 初评分

架构 86、后端 81、安全 88、前端 77、设计语言 80、测试 CI 72、性能传播 74、开源运维 79；等权均值取整 80/100（B+）。这是启发式工程判断；设计、性能和运维分数尤其受上述验证限制影响。最终 A+ 以路线图验收证据为准。
