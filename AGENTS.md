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
4. **Agent Approval Commit Uncertainty**:
   - Once an approval has been durably claimed as `approved`, errors may occur after business effects commit. Never auto-retry that approval ID or mark an uncertain execution `failed` to enable replay.
   - Historical `failed` approvals are not eligible for automatic reviewer retry. Reconciliation must never overwrite in-flight `approved` rows.
   - Follow [the incident recovery runbook](docs/quality/agent-approval-in-doubt-recovery.md); use fresh proposals after manual state verification, not direct SQL state resets.
   - Editorial-task and reply-draft approval effects must commit together with `approved -> executed` using the shared `dbtx.Transactor`, while Operations retains ownership of its business SQL. Never move the business write outside the transaction or relax the database `source_approval_id` uniqueness constraints.
   - Content candidate sets (including all child candidates) and media candidates (including image-brief distribution proposals) must also commit together with the approval's `approved -> executed` transition. Preserve the existing media post-revision guard and unique `source_approval_id`; never introduce a nested Operations transaction into this boundary. Downstream image generation remains a separate, guarded operation.
   - Approved operational suggestions must persist their Operations-owned natural-key upsert together with the Agent `approved -> executed` state transition. The existing SHA256 dedupe key and terminal-state protection (`status='new'` only updates evidence) are immutable unless deliberately redesigned and regression-tested; do not allow review JSON to override trusted `SourceRunID`.
   - `create_draft`, `update_post`, and `update_tags` approvals must use Post-owned transaction-scoped reads/writes and a single `dbtx.Transactor` commit for Post effects, revision-CAS, PostVersion/workflow triggers and `approved -> executed`. New draft target IDs must be assigned in the same transaction. Never call a DB-backed nontransactional PostService method from inside an approval transaction, nor allow approval proposals to bypass draft-only status or editable-field whitelists. Keep Article/Page editing contracts distinct until separately verified.
   - `create_page_draft` and `update_page` approvals must commit Page-owned persistence and Agent `approved -> executed` with the same PostgreSQL transaction. New Page draft `target_id` is assigned within that commit. Updates require a matching nonzero pre-approval Page identity and `updated_at` token, recheck after the durable reviewer claim and use a FINAL-SQL `WHERE updated_at = expected` guard. Page `updated_at` must advance monotonically even for rapid updates or long-running transactions. Keep the PageService title/Slug/reserved-path/duplicate rules and the existing Page edit allowlist; a draft approval may never publish a Page. Never call DB-backed nontransactional Page services inside approval-owned transactions. Ambiguous failures remain quarantined, not auto-retried.
   - Image generation crosses an external AI provider, binary object storage, Media DB metadata, and Agent's Media Candidate state. Each generated result or failure must be fenced by the exact `generation_attempt` returned from the guarded claim. Cancelled or superseded attempts must never modify a newer attempt. If a candidate finalization returns definitive `sql.ErrNoRows`, the newly created orphan asset may be compensated; if it returns any ambiguous database/transport error, **never delete the media bytes or metadata**, because the candidate may already reference it. Preserve assets and generation audits for read-only reconciliation. No automatic external-generation replay or unreviewed lease reset.

---

## 2. Container & Image Conventions

1. **Development Integration (`docker-compose.yml`)**:
   - Dynamic tag defaults: `${XXX_IMAGE:-ghcr.io/rushairer/xxx:main}`.
   - Follows latest `main` images across upstream dependencies (`gosso`, `gosso-admin-seed`, etc.) during development.
   - Never hardcode fixed SHA256 digests in development compose files.
2. **Local Source Development (`docker-compose.source.yml`)**:
   - Uses `:local` tag and `build:` contexts for live local code development.
3. **Production Deployment (`docker-compose.production.yml`)**:
   - First-party application images have **no floating `:main` fallback**. Production must fail closed unless operators provide explicit immutable `version@sha256:digest` references for every first-party application image.
   - `pull_policy: always` may refresh the referenced immutable digest, but it must never change the deployed artifact identity.
   - Third-party infrastructure images remain pinned to audited immutable digests.
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
- Do not add, alter, enable, or remove connector product behaviour—including Google/Search Console OAuth, callback URIs, credential lifecycle, delivery, or Sandbox behaviour—unless the user gives an explicit instruction that names the connector work. Structural ownership refactors are allowed when they preserve those contracts exactly and pass the relevant security/regression gates.
- Treat connector code as isolated from core Blog behaviour. Do not introduce automatic business-event, workflow, publishing, or analytics calls into it without an explicit product decision.

---

## 6. Canonical Gouno UI Integrity

- `rushairer/gouno-ui` is the **single canonical design-system owner**. `blog-frontend` consumes an exact immutable npm registry release as `@gouno/ui`; production code should import canonical components from the explicit `@gouno/ui/core`, `@gouno/ui/theme`, `@gouno/ui/patterns`, or `@gouno/ui/gouno` entrypoint. The package root is not a second ownership layer.
- The historical local `packages/ui` tree is **read-only prior art**. It is not an installable or distributable Blog frontend dependency and must never be republished, vendored, aliased, or reintroduced as `@gouno/ui-legacy`.
- `@gouno/ui-legacy` imports are forbidden in `blog-frontend`. The UI contract must reject any attempted reintroduction. Do not create a Vite or TypeScript alias that redirects canonical `@gouno/ui` imports to the historical local tree.
- Registry upgrades are performed through `.github/workflows/sync-gouno-ui.yml`. The workflow resolves a published npm version, pins it exactly, refreshes the lockfile, verifies supported package entrypoints, runs `blog-frontend` quality, and builds the frontend Docker image before committing.
- Keep `blog-frontend/package.json` and the canonical lockfile entry synchronized with the exact npm registry release. The lockfile must retain the registry tarball URL and integrity metadata; local UI archives, manifests, provenance files, compatibility aliases, and legacy Tailwind sources are forbidden.
- Do not introduce new root-level `@gouno/ui` component imports when a formal layer subpath owns the symbol.
- Before committing any Gouno UI dependency change, run `npm ci` and `npm run quality` in `blog-frontend`, then build the Dockerfile (`docker build -f blog-frontend/Dockerfile blog-frontend`) so package, lockfile, runtime imports, Tailwind sources and container build are verified together.

## 7. UI Refactoring Execution Convention

- Complete a coherent page or shared UI abstraction as a batch before running a browser audit.
- Do not repeat the full test and build suite for every small visual correction.
- Do not re-verify an already confirmed behavior unless there is evidence of regression.
- Run typecheck, tests, builds, and registry dependency verification at the end of a coherent UI phase.
- Use browser verification to confirm actual visual and interaction results; tests and builds do not replace visual confirmation.
- For Showcase parity work, **manual design reasoning comes before automation**: inspect the canonical Showcase and the real product state-by-state (default, empty, error/feedback, detail, editor/drawer, responsive) before changing or trusting parity gates.
- Record each observed difference as intentional product divergence or UI drift. Fix confirmed drift first; only then extract stable findings into source checks, browser parity tests, or other automated contracts.
- A green parity gate proves only the contracts it actually checks. Never infer whole-page visual parity, migration completion, or `verified` status from CI/markers alone.
- Do not mark a page or migration row `verified` until the relevant visible states have been manually compared and browser evidence has confirmed the resulting implementation.
- Prefer one shared local composition helper for Showcase-owned patterns that are not public `@gouno/ui` APIs; do not maintain multiple page-private copies of the same canonical pattern.
- `docs/ui-redesign/showcase-parity-certifications.json` is the only authority for current Showcase parity certification status. Historical migration ledgers and hardening reports are evidence only.
- Any change to a `verified` certification's product-owned paths, canonical Showcase paths, or consumed `@gouno/ui` baseline invalidates that certification until a fresh manual review and browser evidence are recorded. Never auto-promote certification from CI.
- Changes that touch a `verified` certification's owned Product paths or its certification policy/evidence must go through a pull request so the strict Showcase parity workflow executes before merge. Do not direct-push parity-sensitive changes to `main` and rely on post-merge CI.
- Continue within the user's authorized scope without pausing for confirmation after every internal implementation step.
- Preserve uncommitted work, authentication boundaries, the Connector hold, and canonical UI integrity rules.

---

## 8. Backend Capability Module Architecture

- `blog-backend` is a complex application and its target organization is **Capability Module**: capability first, layer second. The authoritative project description is `blog-backend/ARCHITECTURE.md`.
- The former root business-layer buckets `blog-backend/internal/domain`, `blog-backend/internal/service`, `blog-backend/internal/repository`, and `blog-backend/internal/controller` are retired. Capability-owned models, persistence, services, and HTTP transport live under `internal/<capability>/`; shared transaction and HTTP primitives live only under explicit infrastructure packages such as `internal/dbtx`, `internal/dberror`, and `internal/controllerutil`. Terminal guards reject recreation of the retired root buckets.
- New business capabilities should live under `blog-backend/internal/<capability>/` and contain only the `domain`, `repository`, `service`, `controller`, or other internal packages they actually require. Never keep unused layers merely for symmetry after a capability is implemented.
- Capability structural convergence is complete, including Access HTTP ownership relocation and Connector structural ownership convergence. Do not reintroduce generic root business layers or compatibility facades. Connector product behavior remains protected by Section 5 even though its code is structurally canonical.
- Do not perform filename-only moves that leave cross-package ownership unresolved, change behavior accidentally, or create import cycles.
- Shared HTTP/controller primitives belong in `blog-backend/internal/controllerutil`; capability controllers may depend on this package. `internal/controllerutil/retired_controller_boundary_test.go` and `internal/dbtx/retired_repository_boundary_test.go` enforce that the retired root controller/repository buckets do not return.
- Gouno Core does not own this architecture. Blog owns `.gouno/codegen.yaml` and uses the project-defined `module` generator to create a minimal Capability Module skeleton. The manifest and `.gouno/codegen/` templates are the source of truth for Blog Codegen policy.
- `module` must remain structural and conservative: do not silently generate database access, routes, migrations, dependency injection, cross-capability imports, security policy, Connector behavior, or a mandatory `module.go` without a separately proven project convention.
- Preserve upstream/default `suite` semantics. Capability Module generation is expressed by Blog's distinct `module` command and must not be implemented by redefining `suite`.
- Any Codegen policy change must update the manifest, referenced templates, architecture documentation, and CI smoke verification together.
- Every backend architecture/Codegen batch must pass the repository's full backend, database-integration, dependency-review, compose, and unaffected frontend/seed gates before merge to `main`.
- Architecture and Codegen work never override Sections 1-5: the confidential BFF, identity/session rules, deployment contracts, and Connector Module Hold remain immutable unless the user explicitly changes them.

---

## Dependency Baseline Invariants

- Backend and Seed use the patched Go 1.27.x series, with a security floor of Go 1.27.2 after the October 8, 2026 standard-library advisories. Keep both `go.mod` directives, GitHub Actions `go-version-file` inputs and digest-pinned multi-architecture Docker builder versions aligned; `.github/scripts/check_go_toolchain_security.py` must fail CI on downgrade, tag drift or an unpinned builder. Never suppress reachable `govulncheck` findings as a substitute for patching.
- Backend `golang.org/x/net` must remain at **v0.60.0 or newer** after the October 9, 2026 HTTP/2 advisories, with matching verified `go.sum` checksums and compatible `x/crypto`, `x/sys`, `x/term`, and `x/text` versions. The same toolchain security script enforces the vulnerable-module floor. Changes to security pins must pass `go mod verify`, `go vet`, race, `govulncheck`, and immutable image scans; never ignore reachable HTTP/2 findings.
- `blog-frontend` production and CI runtime is Node 24 LTS, with a project engine floor of Node 24.15 to satisfy the supported jsdom 30 toolchain. Keep `@types/node` on the same major. A future Node major migration must update Docker builders, CI setup, `package.json` engine metadata, lockfile metadata, and Node type declarations as one reviewed change.
- TypeScript 7.0 is the CLI compiler baseline but does not expose the legacy JavaScript Compiler API. Keep `@typescript/native` aliased to TypeScript 7 for `tsc`, while the `typescript` package key is aliased to `@typescript/typescript6` for repository AST/governance scripts. Do not collapse these into a single TypeScript 7 dependency until an explicit API migration is reviewed.
- Prettier `3.8.5` is an intentional governance pin while certified Product paths are frozen. Patch updates may be evaluated normally; formatter minor/major changes that rewrite certified Product source require an explicit certification-impact review before adoption rather than automatic dependency churn.
- Dependency freshness does not mean choosing the numerically highest major. Runtime, type declarations, compiler CLI, programmatic API consumers, production compatibility, immutable deployment inputs, and manual-first Showcase certification must remain aligned.

