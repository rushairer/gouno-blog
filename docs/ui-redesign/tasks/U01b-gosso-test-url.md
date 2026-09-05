# U01b：gosso-admin 测试 URL 契约

状态：planned。前置：阶段 0 已完成盘点。

## 目标与范围

修正 `gosso-admin-frontend` Vitest 环境仍使用被禁止的 `localhost:8443/identity-admin/` 问题。统一到标准 `https://sso.dev.local`（必要时保留 `/identity-admin` 子路径语义），同步相关测试 fixture、配置和文档。不得修改生产路由、认证协议或将 8443 带回 Compose/Caddy。

## 验收

- [ ] `rg` 不再发现该前端测试配置使用 `localhost:8443`。
- [ ] 根路径和 `/identity-admin` 的测试 URL 语义均有针对性验证。
- [ ] gosso-admin quality、构建和相关测试通过。
- [ ] 更新清单与结果，记录仍存在的非阻断警告。

## 结果

- 起始基线：未执行
- URL 来源与改动：未执行
- 验证与未测项：未执行
