# Gosso Admin Showcase migration contract

A page is complete only when static fixtures and local interactions cover every real field, rendered column, action, dialog, validation, loading/empty/error/forbidden/success/conflict state, pagination rule, filter parameter, and focus/Escape behavior from the corresponding Gosso Admin page.

## UsersTab

Account fields: `id`, `username`, `display_name`, `status`, optional `created_at`, optional `roles[]` (`id`, `name`, optional `description`). Render display name, username/id, status, all roles and descriptions, pagination, loading, error retry, and empty state. Cover create-user, assign/remove roles, consents loading/empty/error/revoke, password reset validation, suspend/activate confirmation, lockout clear, MFA reset, delete confirmation plus sudo presentation.

## ClientsTab

OAuth2Client fields: `client_id`, `name`, `description`, `redirect_uris[]`, optional `post_logout_redirect_uris[]`, `grant_types[]`, `scopes[]`, `is_confidential`, optional `allowed_resources[]`, optional `metadata`. Render every field, copy each URI, classify confidential/public, tag every grant and scope, and cover loading/error/empty. Cover register/edit validation, secret rotation/result/copy, and delete confirmation.

## AuditLogsTab

AuditLog fields: `id`, `action`, `actor`, optional `account_id`, `event_type`, `created_at`, `resource`, `meta`. Cover event/account filters, search/clear, all columns, pagination, loading/error/empty, and a details dialog showing resource and meta.

## Shared acceptance

Verify full/1024x768/768x1024/390x844, light/dark, desktop and mobile navigation, no overflow, Escape close, and focus restoration. Showcase must never use authentication, cookies, tokens, APIs, permissions, or Connector behavior.
