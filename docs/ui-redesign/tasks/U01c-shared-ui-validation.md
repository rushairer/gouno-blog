# U01c：共享 UI 包独立验证

状态：verified。前置：U01a、U01b verified 或有明确阻断记录。

## 目标与范围

验证 `packages/ui` 可独立 `npm ci`、typecheck、test、build、pack 和 showcase build；验证 Blog 与 gosso-admin 使用相同归档、版本和 integrity。检查 Blog、Blog Admin、Gosso Admin 三品牌及 light/dark/system 主题，不迁移业务页面。

## 验收

- [x] 包内测试覆盖 ThemeProvider、受限运行环境和核心模板。
- [x] showcase 可构建并展示 shell、layout、form、feedback、table/状态组合。
- [x] 两消费者 manifest 的 sha256/integrity 与归档一致。
- [x] Tailwind `@source`、字体、主题 CSS 和 bootstrap 入口可解析。
- [x] 更新清单和证据。

## 结果

- 起始 HEAD / 工作区：`b1ee1b70e8214ea98140ffda333de76d6276451a` / `main`，`gouno-blog` 工作区干净；U01a、U01b 均为 `verified`。相关 `gosso-admin` 工作区保留 U01b 的既有未提交改动。
- 包版本/归档：`@gouno/ui@0.1.0`；重新执行分发脚本后，消费者归档 `gouno-ui-0.1.0.tgz` 两份字节一致，且与当前 `packages/ui` 归档一致，SHA-256 `b86698a7ad7409bed50396f64f5b45acae8e995bcc1dec025bbe24fae2c58630`，integrity `sha512-iwi4xaQLfHQzuWEPVRt/9iMzwx3GwkEElfHzctnOJ8ymxPgQbWByilfFiIY9B266FOByDlzwQQaB6iwlRlKX1g==`；已同步两消费者 manifest。
- 命令结果：`npm ci`、`npm run typecheck`、`npm test -- --run`（5 tests）、`npm run build`、正确的 `npm pack --json`、`npm run showcase:build` 均 exit 0；误用的 `npm pack -- --json` exit 1，已纠正并记录。`git diff --check` exit 0。保留既有字体解析、Lightning CSS `@theme`、Node localStorage 非阻断警告。
- 主题与消费者验证：包内 ThemeProvider 测试覆盖 `blog`、`blog-admin`、`gosso-admin` 及 constrained runtime；浏览器 showcase 证实 Shell、layout、form、feedback、table/status 组合可见，浅色/深色/跟随系统控件可用（system 按当前环境解析为 dark）。Tailwind `@source`、tokens/base CSS、bootstrap 与字体均可解析/随包输出。
- 未测项与阻断项：未执行已认证业务路由、生产域名、响应式宽度和完整三消费者浏览器运行；无阻断项。Connector 行为未触及。
- 下一任务交接：U01d 已复核并 verified；可进入 U02a。
