# U01b：gosso-admin 测试 URL 契约

状态：verified。前置：阶段 0 已完成盘点。

## 目标与范围

修正 `gosso-admin-frontend` Vitest 环境仍使用被禁止的 `localhost:8443/identity-admin/` 问题。统一到标准 `https://sso.dev.local`（必要时保留 `/identity-admin` 子路径语义），同步相关测试 fixture、配置和文档。不得修改生产路由、认证协议或将 8443 带回 Compose/Caddy。

## 验收

- [x] `rg` 不再发现该前端测试配置使用 `localhost:8443`。
- [x] 根路径和 `/identity-admin` 的测试 URL 语义均有针对性验证。
- [x] gosso-admin quality、构建和相关测试通过。
- [x] 更新清单与结果，记录仍存在的非阻断警告。

## 结果

- 起始基线：`gouno-blog` HEAD `b1ee1b70e8214ea98140ffda333de76d6276451a`、`gosso-admin` HEAD（`main`，工作区干净）；阶段 0 前置满足。
- URL 来源与改动：`gosso-admin-frontend/vitest.config.ts` 原为 `https://localhost:8443/identity-admin/`，已改为 `https://sso.dev.local/identity-admin/`；新增 `src/config/__tests__/testUrl.test.ts` 覆盖标准 origin 下的 `/` 与 `/identity-admin/`。
- 验证与未测项：`rg -n "localhost:8443" gosso-admin-frontend` 无匹配（rg 退出 1，表示无匹配）；定向测试退出 0（2 files / 3 tests）；`npm run quality` 退出 0（20 files / 110 tests，coverage 43.89% statements、39.22% branches、31.83% functions、44.63% lines，构建通过）；`git diff --check` 退出 0。浏览器已检查 `https://sso.dev.local/`，可见 GOSSO Admin 登录页并进入标准 `/login?...`，直达 `/identity-admin/` 显示既有“页面未找到”回退；未测认证后流程、响应式和明暗主题。保留既有 oxlint 未使用变量、Vite `__dirname`、jsdom navigation、localStorage experimental warnings。
- 阻断项：无。
- 下一任务交接：U01c 可基于 U01a、U01b 均为 `verified` 开始共享包安装、展示和三品牌主题验收；U01d 仍需复核浏览器与分发证据。
