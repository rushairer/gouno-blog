# U07a：双仓库分发与构建

状态：planned。前置：U04c、U06b。

## 目标与范围

验证 `packages/ui` 的 npm pack、版本/integrity manifest、两个前端的精确 file 依赖、独立干净检出后的 `npm ci`、Tailwind `@source`、前端 Docker 构建、Compose 配置以及 gosso-admin 根路径和 `/identity-admin` 构建。

## 验收

- [ ] 不依赖相邻源码、绝对路径或本地软链接。
- [ ] 分发产物由脚本生成，消费者归档和 manifest 一致。
- [ ] 开发 Compose 不含固定 SHA digest，生产 Compose 遵守 secret 约束。
- [ ] 标准域名/端口契约无 8443 漂移。

## 结果

- 构建基线：未执行
- 归档/容器证据：未执行
