# U05a：gosso-admin 认证与账户

状态：planned。前置：U01d。

## 目标与范围

迁移 `/login`、`/callback`、`/forgot-password`、`/reset-password`、`/`、`/account-settings` 及 profile、password、mfa、passkeys、sessions 子视图。保留密码/Passkey、MFA、近期强认证、账户不匹配、query/hash、跳转和错误反馈。

## 验收

- [ ] 登录、回调、找回、重置和账户设置的成功/失败状态保留。
- [ ] MFA、Passkey、恢复码和会话退出的敏感交互无行为变化。
- [ ] 根路径与 `/identity-admin` 子路径构建均通过。
- [ ] 未具备真实身份条件的流程明确标记未验证。

## 结果

- 起始基线：未执行
- 改动/证据/阻断：未执行
