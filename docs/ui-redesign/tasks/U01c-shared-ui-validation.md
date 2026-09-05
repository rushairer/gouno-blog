# U01c：共享 UI 包独立验证

状态：planned。前置：U01a、U01b verified 或有明确阻断记录。

## 目标与范围

验证 `packages/ui` 可独立 `npm ci`、typecheck、test、build、pack 和 showcase build；验证 Blog 与 gosso-admin 使用相同归档、版本和 integrity。检查 Blog、Blog Admin、Gosso Admin 三品牌及 light/dark/system 主题，不迁移业务页面。

## 验收

- [ ] 包内测试覆盖 ThemeProvider、受限运行环境和核心模板。
- [ ] showcase 可构建并展示 shell、layout、form、feedback、table/状态组合。
- [ ] 两消费者 manifest 的 sha256/integrity 与归档一致。
- [ ] Tailwind `@source`、字体、主题 CSS 和 bootstrap 入口可解析。
- [ ] 更新清单和证据。

## 结果

- 包版本/归档：未执行
- 命令结果：未执行
- 主题与消费者验证：未执行
