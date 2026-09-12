# Gouno Blog - AI Agent Architectural & Operational Guidelines

This document defines the **immutable architectural rules, security baselines, and deployment conventions** for AI agents working in this repository.

---

## 1. Architectural Baseline & Security Contract

1. **Split-Domain Confidential BFF Architecture**:
   - Blog is an independent, confidential OAuth 2.0 / OIDC client (`blog-bff`).
   - Browser never handles raw access/refresh tokens; authentication is exclusively maintained via HttpOnly, Secure, SameSite Cookie sessions on the Blog origin (`/api/auth/*`).
   - Split-domain topology (`blog.<domain>` vs `sso.<domain>`) is permanent.
2. **Identity & Authorization**:
   - Blog authorization relies strictly on locally configured owner identity (`Issuer + Subject`).
   - Provider roles/scopes do not grant implicit administrative permissions.
3. **Session & Logout Lifecycle**:
   - Supports local logout, global RP-Initiated logout, and atomic back-channel logout claim handling.
   - Redis session state must strictly prevent resurrection on concurrent refresh/logout.

---

## 2. Container & Image Conventions

1. **Development Integration (`docker-compose.yml`)**:
   - Dynamic tag defaults: `${XXX_IMAGE:-ghcr.io/rushairer/xxx:main}`.
   - Follows latest `main` images across upstream dependencies (`gosso`, `gosso-admin-seed`, etc.) during development.
   - Never hardcode fixed SHA256 digests in development compose files.
2. **Local Source Development (`docker-compose.source.yml`)**:
   - Uses `:local` tag and `build:` contexts for live local code development.
3. **Production Deployment (`docker-compose.production.yml`)**:
   - Requires explicit image parameters (Release tags like `:v1.4.0` or audited immutable digests).
   - Production secrets must be provided via Docker Secret files; raw env var secrets are rejected.

---

## 3. Versioning Guidelines

- Follow Semantic Versioning (SemVer).
- Prior to official public GA release, development and security hardening iterate within the **`1.x`** major series (e.g. `1.4.0`). Major version `2.0.0` is reserved for true generational product milestones.
- Keep `CHANGELOG.md` updated for every release.

---

## 4. Local Domain & Standard Port Contract

- **Standard Ports Only**: Local development domains are strictly **`https://sso.dev.local:443`** (or standard `https://sso.dev.local`) and **`https://blog.dev.local:443`** (or standard `https://blog.dev.local`).
- **Forbid Port 8443**: Non-standard port `8443` is explicitly forbidden. Caddy gateway listens on `443` / `80`. Agents must never drift back to `8443`.

---

## 5. Connector Module Hold

- The external connector module (`blog-backend/internal/connector`, its controller/routes, migrations, and frontend workspace) is under active product design and is **not production-complete**.
- Do not add, alter, enable, remove, or refactor connector behaviour—including Google/Search Console OAuth, callback URIs, credential lifecycle, delivery, or Sandbox behaviour—unless the user gives an explicit instruction that names the connector work.
- Treat connector code as isolated from core Blog behaviour. Do not introduce automatic business-event, workflow, publishing, or analytics calls into it without an explicit product decision.

---

## 6. Canonical Gouno UI Integrity

- `rushairer/gouno-ui` is the **single canonical design-system owner**. `blog-frontend` consumes its verified vendored artifact as `@gouno/ui`; production code should import canonical components from the explicit `@gouno/ui/core`, `@gouno/ui/theme`, `@gouno/ui/patterns`, or `@gouno/ui/gouno` entrypoint. The package root is not a second ownership layer.
- The historical local `packages/ui` tree is **read-only prior art**. It is not an installable or distributable Blog frontend dependency and must never be republished, vendored, aliased, or reintroduced as `@gouno/ui-legacy`.
- `@gouno/ui-legacy` imports are forbidden in `blog-frontend`. The UI contract must reject any attempted reintroduction. Do not create a Vite or TypeScript alias that redirects canonical `@gouno/ui` imports to the historical local tree.
- Canonical artifacts are synchronized only through `.github/workflows/sync-gouno-ui.yml`. The workflow must build and verify the selected upstream ref, derive the package version dynamically, update only the canonical archive/dependency/manifest/provenance, run `blog-frontend` quality, and build the frontend Docker image before committing.
- Keep `blog-frontend/vendor/ui-manifest.json`, `blog-frontend/vendor/gouno-ui-source.txt`, `blog-frontend/package.json`, and the canonical lockfile entry synchronized with the exact external artifact. There is no legacy compatibility archive, manifest, lockfile entry, or Tailwind source.
- Do not introduce new root-level `@gouno/ui` component imports when a formal layer subpath owns the symbol.
- Before committing any UI vendor change, run `npm ci` and `npm run quality` in `blog-frontend`, then build the Dockerfile (`docker build -f blog-frontend/Dockerfile blog-frontend`) so package, lockfile, runtime imports, Tailwind sources and container build are verified together.

## 7. UI Refactoring Execution Convention

- Complete a coherent page or shared UI abstraction as a batch before running a browser audit.
- Do not repeat the full test and build suite for every small visual correction.
- Do not re-verify an already confirmed behavior unless there is evidence of regression.
- Run typecheck, tests, builds, and vendored package synchronization at the end of a coherent UI phase.
- Use browser verification to confirm actual visual and interaction results; tests and builds do not replace visual confirmation.
- Continue within the user's authorized scope without pausing for confirmation after every internal implementation step.
- Preserve uncommitted work, authentication boundaries, the Connector hold, and canonical UI integrity rules.

---

## 8. Backend Capability Module Architecture

- `blog-backend` is a complex application and its target organization is **Capability Module**: capability first, layer second. The authoritative project description is `blog-backend/ARCHITECTURE.md`.
- `blog-backend/internal/domain`, `internal/repository`, `internal/service`, and `internal/controller` are transitional flat-layer migration buckets. Do not add new business ownership to them when a capability-local home exists or can be introduced coherently.
- New business capabilities should live under `blog-backend/internal/<capability>/` and contain only the `domain`, `repository`, `service`, `controller`, or other internal packages they actually require. Never keep unused layers merely for symmetry after a capability is implemented.
- Migrate existing flat-layer code by coherent capability slices. The `page` capability is the reference migration: canonical implementation under `internal/page/`, with temporary type/function/error facades in legacy flat packages where moving every consumer would create unnecessary blast radius.
- Do not perform filename-only moves that leave cross-package ownership unresolved, change behavior accidentally, or create import cycles.
- Shared HTTP/controller primitives belong in `blog-backend/internal/controllerutil`; capability controllers may depend on this package. The legacy `internal/controller` package may expose compatibility facades during migration but is not the destination for new business controllers.
- Gouno Core does not own this architecture. Blog owns `.gouno/codegen.yaml` and uses the project-defined `module` generator to create a minimal Capability Module skeleton. The manifest and `.gouno/codegen/` templates are the source of truth for Blog Codegen policy.
- `module` must remain structural and conservative: do not silently generate database access, routes, migrations, dependency injection, cross-capability imports, security policy, Connector behavior, or a mandatory `module.go` without a separately proven project convention.
- Preserve upstream/default `suite` semantics. Capability Module generation is expressed by Blog's distinct `module` command and must not be implemented by redefining `suite`.
- Any Codegen policy change must update the manifest, referenced templates, architecture documentation, and CI smoke verification together.
- Every backend architecture/Codegen batch must pass the repository's full backend, database-integration, dependency-review, compose, and unaffected frontend/seed gates before merge to `main`.
- Architecture and Codegen work never override Sections 1-5: the confidential BFF, identity/session rules, deployment contracts, and Connector Module Hold remain immutable unless the user explicitly changes them.
