# Gouno Blog Frontend

React 19 + TypeScript + Vite single-page application. **Public Blog** (`/` and public routes) and **Blog Admin** (`/admin/*`) are two route groups within **one frontend application**, not two separately deployed SPAs.

See [the current As-Is architecture SVG and source inventory](../docs/architecture/README.md).

## Authentication: server-side confidential BFF

- `src/auth.ts` configures `@gosso/client` with `sessionMode: "cookie"`, `sessionProfileEndpoint: "/api/me/blog-session"`, `sessionRefreshEndpoint: "/api/auth/refresh"`, `authorizeEndpoint: "/api/auth/login"` and `logoutEndpoint: "/api/auth/logout"`.
- The browser navigates to same-origin `GET /api/auth/login`; **the Go backend `internal/authbff`** creates PKCE/state/nonce, redirects to GOSSO, receives **`GET /api/auth/callback`**, exchanges the code and verifies ID tokens. The SPA does **not** handle OAuth `/callback` and does not receive provider tokens.
- Blog session is an opaque host-only Secure/HttpOnly Cookie backed by encrypted Redis data. The readable `__Host-blog-csrf` Cookie exists only for CSRF header matching; it is not a provider token.
- The GOSSO login/password/MFA/Passkey UI lives on the SSO origin in `gosso-admin-frontend`, not in Blog.
- `src/api/client.ts` exports a thin `Proxy` around the SDK client; it adds a one-time MFA step-up/retry for eligible privileged AI API calls. `src/api/posts.ts` and other domain APIs use `apiClient`; React pages must not duplicate protocol/transport logic.
- The `Admin` route guard reads Blog-local membership/permissions (from `/api/me/blog-session`) and provides UI gating. **Only the Go backend's authorization middleware is security-authoritative**. The Blog does not derive its permissions from GOSSO's global admin role.

## Local development

```bash
npm ci
npm run dev
```

The full integrated app is served through the repository-root Caddy HTTPS Compose gateway at `https://blog.dev.local`. Paths other than Blog APIs/media/feed/sitemap go to `blog-frontend:8081`; `/api/*` is routed to `blog-backend:8082`. The callback URI is `https://blog.dev.local/api/auth/callback`, handled by Go.

`VITE_GOSSO_ISSUER` optionally configures the public issuer for an appropriately provisioned deployment. **Do not put confidential client IDs/secrets, OAuth verifier, Token exchange details or BFF callback settings in `VITE_*` browser variables.** The server uses `BLOG_OIDC_*` and secured runtime secrets.

## Commands

```bash
npm run lint
npm run lint:ui
npm run test:run
npm run build
```

Refer to `package.json` and `package-lock.json` for exact `@gosso/client` and `@gouno/ui` versions instead of copying historical version numbers. Any changes to cookie/callback/CSRF/refresh/MFA/logout contracts require cross-repository regression verification.

Source and Compose inspections are not live-production certification. Validate actual HTTPS redirect, host-only cookies, CSRF, concurrent refresh/logout and role-scoped APIs in representative integration tests.
