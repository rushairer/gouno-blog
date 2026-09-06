export const showcaseRecords = [
  ["设计系统迁移", "已发布", "编辑器", "2026-09-06"],
  ["首页改版提案", "草稿", "文章", "2026-09-05"],
  ["安全审计报告", "待处理", "系统", "2026-09-04"],
  ["移动端体验复盘", "已发布", "页面", "2026-09-03"],
] as const;

export const showcaseMetrics = [
  ["活跃用户", "2,480", "较上周 +12%"],
  ["待处理任务", "18", "需要关注"],
  ["已发布文章", "126", "本月 +24%"],
  ["系统可用性", "99.98%", "运行正常"],
] as const;

// Field-complete static mirrors of Gosso Admin src/types/api.ts.
export const gossoUsers = [
  { id: "acct_01", username: "admin@example.com", display_name: "Gosso Admin", status: "active", created_at: "2026-01-12T09:00:00Z", roles: [{ id: "role_admin", name: "admin", description: "Full administration" }] },
  { id: "acct_02", username: "editor@example.com", display_name: "Content Editor", status: "active", created_at: "2026-02-03T10:30:00Z", roles: [{ id: "role_editor", name: "editor", description: "Content management" }] },
  { id: "acct_03", username: "suspended@example.com", display_name: "Suspended User", status: "suspended", created_at: "2026-03-18T14:20:00Z", roles: [] },
];
export const gossoClients = [
  { client_id: "blog-bff", name: "Blog BFF", description: "Confidential Blog OAuth client", redirect_uris: ["https://blog.dev.local/api/auth/callback"], post_logout_redirect_uris: ["https://blog.dev.local/"], grant_types: ["authorization_code", "refresh_token"], scopes: ["openid", "profile", "email"], is_confidential: true, allowed_resources: [], metadata: {} },
  { client_id: "admin-console", name: "Admin Console", description: "Gosso administrative console", redirect_uris: ["https://sso.dev.local/admin/callback"], post_logout_redirect_uris: ["https://sso.dev.local/admin"], grant_types: ["authorization_code"], scopes: ["openid", "profile", "admin"], is_confidential: false, allowed_resources: [], metadata: {} },
];
export const gossoAuditLogs = [
  { id: "audit_01", action: "login.success", actor: "admin@example.com", account_id: "acct_01", event_type: "authentication", created_at: "2026-09-06T07:24:00Z", resource: {}, meta: { ip: "192.0.2.10" } },
  { id: "audit_02", action: "client.updated", actor: "admin@example.com", event_type: "client", created_at: "2026-09-06T06:18:00Z", resource: { client_id: "blog-bff" }, meta: {} },
];
