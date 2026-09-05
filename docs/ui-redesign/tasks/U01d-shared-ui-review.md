# U01d：共享 UI 阶段独立复核

状态：verified。前置：U01c。

## 目标与范围

在独立新会话审阅 U01a–U01c 的实际 diff、测试输出、归档和 showcase，确认没有通过降低门槛、手工编辑产物或隐藏环境依赖获得假绿灯。只做复核，不开展公共页面迁移。

## 通过条件

- [x] 前置任务结果与当前代码基线一致。
- [x] Blog coverage 阻断已真实解除或明确保持 blocked。
- [x] gosso-admin 不再使用 8443 测试 URL。
- [x] 共享包可独立构建，两个消费者消费同一可核验归档。
- [x] 未验证的浏览器主题/响应式范围保持显式未验证。

## 结果

- 复核基线：`git status --short --branch` 在两个仓库均 exit 0 且起始工作区干净；U01a、U01b、U01c 均标记 `verified`。
- 发现与归属任务：质量门槛真实通过（Blog 44 files/167 tests，branch coverage 45.03%；gosso-admin 20 files/110 tests）；`rg -n "localhost:8443" gosso-admin-frontend` 无匹配；共享包 typecheck、5 tests、build、showcase build 均通过。使用 `node scripts/ui/distribute.mjs blog-frontend ../gosso-admin/gosso-admin-frontend` exit 0 后，`packages/ui` 与两个消费者归档均为 SHA-256 `b86698a7ad7409bed50396f64f5b45acae8e995bcc1dec025bbe24fae2c58630`，integrity `sha512-iwi4xaQLfHQzuWEPVRt/9iMzwx3GwkEElfHzctnOJ8ymxPgQbWByilfFiIY9B266FOByDlzwQQaB6iwlRlKX1g==`；消费者归档 `cmp` exit 0，manifest 与归档一致。showcase 浏览器可见 Shell/layout/form/feedback/table/status，深色主题切换后 `data-theme=dark`。
- 结论：verified。`rg -n "localhost:8443" /Users/aben/Git/gosso-admin/gosso-admin-frontend` exit 1（无匹配），`git diff --check` exit 0。仍未测认证后路由、响应式宽度、生产域名及完整三消费者浏览器运行；Connector 行为未触及。下一任务：U02a。
