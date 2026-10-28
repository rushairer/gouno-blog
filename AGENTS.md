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
   - Membership and Owner-transfer mutations must verify the actor's **current, active Blog-local roles under the same PostgreSQL advisory lock used to serialize role writes**. A middleware snapshot obtained before a concurrent Owner transfer is not authorization to act as the previous Owner. Use row-level `FOR UPDATE` only on base membership rows, never on grouped/aggregated role SELECTs.
   - An Owner-role denial may commit an append-only `membership_update_denied` audit **only before any target business write**; it must never commit a display name, new membership, role change or authorization version. Denial audit/commit failures must not be ignored. Keep regular successful role changes transaction-atomic.
   - Never echo raw `err.Error()` from privileged membership or Owner-transfer service failures. Classify only typed, fixed safe domain errors as HTTP 400/403; unexpected storage failures remain 5xx with trusted server logging, not a fabricated 403.
3. **Session & Logout Lifecycle**:
   - Supports local logout, global RP-Initiated logout, and atomic back-channel logout claim handling.
   - Every RP-Initiated logout URL **must use only the exact configured, registered Blog-origin `/api/auth/logout/callback` URI**, even if a caller supplies a different Blog-local destination. Do not send relative/unregistered destinations to the identity provider, or invent server-side destination tracking that does not exist. A valid logout callback state is single-use. If logout-state setup fails, HTTP must not report that global logout succeeded; clear the local cookie and report a fixed safe error.
   - Interactive OIDC callback failure logs must be fixed, non-sensitive events. Never include user-controlled OAuth `error` values, decoded token/verifier errors, Redis/storage cause strings, private endpoint details or credentials in HTTP bodies or callback logs.
   - Redis session state must strictly prevent resurrection on concurrent refresh/logout.
   - BFF OIDC regression tests must exercise real TLS discovery and *cryptographically verified* test ID/logout JWTs for PKCE, state, nonce, issuer, audience, step-up identity and Redis refresh/logout CAS; a mock callback response or unsigned claim map is not evidence of protocol correctness. Back-channel logout must remain bound to exact issuer + SID/subject and an owner-fenced replay lease, with no cross-issuer deletion. Keep the `internal/authbff` security coverage ratchet monotonically increasing; never lower it or equate a coverage percentage with release certification.
   - OIDC Back-Channel Logout returns a stable, non-sensitive HTTP 400 error response for invalid tokens and failed logout, with `Cache-Control: no-store`. Never reflect or log raw token-verifier, Redis, or infrastructure error strings; classify trusted failures with `errors.Is` and retain the original cause only inside trusted Go error chains.
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
   - A provider/generation error (including timeout and cancelled worker context) does **not** prove that the external request was not fulfilled or billed. Keep its current `generation_attempt` in the non-retryable `generating` state, mark `error_code=outcome_uncertain` with a fixed non-sensitive message and surface it through read-only `GET /api/admin/ai-media-generation-reconciliation` or the expired-deadline query. Use a short `context.WithoutCancel` timeout when recording the marker on shutdown. The report must have bounded results, expose only audit metadata (never prompts or secrets), and **must not** alter task status, retry requests, infer success from old audits, or release a generation lease. Any later explicit cancel/regenerate requires independent operator verification that no useful external result remains.
   - Governed image generation must confirm a unique `started` audit for the claimed candidate/attempt before external dispatch; missing or ambiguous audit acknowledgement stops the call. Finish only that audit identity, never infer a current attempt from the latest historical row, and never replay after audit failure. Read [the capability-specific rules](blog-backend/internal/agent/AGENTS.md) and [the operational interpretation](docs/quality/media-generation-attempt-audit.md) before changing this boundary. Audit evidence does not establish Provider-side idempotency or billing outcome.
   - Choose an image-generation protocol before dispatch. OpenAI-compatible `auto`/empty mode uses Responses once; Chat-only gateways must explicitly select `chat_completions`. Gemini `auto`/empty mode selects exactly one endpoint from the configured model before dispatch (`predict` for Imagen-named models, otherwise `generateContent`); explicit `predict`/`generate_content` remain single-endpoint. Never fall back to another generation endpoint after an error or missing image, and never add an unverified idempotency header. Preserve the independently tested text-generation protocol/stream negotiation. Verify actual HTTP request counts, not just adapter invocation counts.
   - Before a governed provider dispatch, persist bounded non-secret evidence for the exact attempt: Provider profile ID, normalized vendor, one-way configuration fingerprint and a unique local dispatch ID. This evidence is correlation only: it is not a Provider request ID, idempotency key, billing receipt or proof of delivery. Before object-store `Put`, persist the exact planned storage name and URL on the same started audit; failure or ambiguous acknowledgement stops before object storage and never authorizes Provider replay. A recorded locator is not proof that bytes exist.
   - Direct Media Candidate cancel must never turn a claimed `generating` attempt into a retryable state. Any generation_attempt>0 (including historical `failed` / `cancelled`) requires a separately authorized manual recovery decision for that exact candidate/attempt before a later user-initiated claim. The protected manual decision requires both local `ManageAI` and `ManageSite`, AAL2/recent MFA, a non-secret incident reference, independently checked Provider/object outcomes, billing acknowledgement, a fenced short PostgreSQL transaction and independently retained append-only audit. No provider request, auto replay, storage mutation, silent attachment or publication occurs during resolution. Read [the recovery runbook](docs/quality/media-generation-manual-recovery.md).
   - Treat upstream request/account identifiers as opaque, bounded diagnostic evidence only. For the official OpenAI API host (`api.openai.com`) with Vendor `openai`, the local dispatch ID may be sent as the documented `X-Client-Request-Id`; never forward that header to OpenAI-compatible/custom gateways. Capture OpenAI `x-request-id` / organization evidence, Anthropic `request-id` / organization / workspace evidence, and Gemini GenerateContent `responseId` where actually returned. Missing evidence never proves non-execution or non-billing, and none of these identifiers authorize replay or act as a generic idempotency key.
   - Initial Media metadata creation is distinct from candidate-finalization CAS. AI-generated images, direct editor images and ordinary uploads must retain stored bytes on **any** `CreateMedia` error, including a missing returned ID, cancellation or `sql.ErrNoRows`; the INSERT may have committed. Do not infer a rollback or run automatic orphan cleanup. Keep any durable metadata and audit evidence for independent operator verification; this rule does not make object storage and PostgreSQL atomic.

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
- **React state/effect correctness is an explicit release contract**: never mutate a ref during render to track a value for future event handlers. Step-Up MFA draft snapshots must read the latest committed editor value and remain scoped to the active form key; exercise rerender/key-switch/disabled cases with real Hook tests. Article SEO head effects must rerun on changes to the effective site brand (including `SITE_SETTINGS_UPDATED_EVENT`) and clean up canonical/JSON-LD metadata without duplication. Resolve lint warnings by testing the behavior, not by disabling React rules or editing certified Product-owned UI without the manual-first Showcase parity process.
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
- **HTTP error transport is a confidentiality boundary**: never echo arbitrary `err.Error()`, JSON decoder details or wrapped Provider/Redis/PostgreSQL/file-system errors to clients. For unknown infrastructure failures use `controllerutil.WriteDomainError` (safe 5xx, original cause in trusted logs). For untrusted JSON binding use `controllerutil.WriteJSONBindingError` (fixed 400; bounded bodies preserve explicit 413) in Agent, Workflow, Community, Knowledge and Operations; keep public Community comment validation wording independently intact. The Go AST regression guard in `internal/controllerutil/controller_transport_security_test.go` covers the ten audited Agent, Workflow, Community, Knowledge, Operations, Media, Site, Taxonomy, Article and Page capability controllers, but cannot prove absence of indirect leaks. **Article/Page lookups must distinguish a confirmed missing row (`sql.ErrNoRows`, mapped not-found sentinel or nil result) from an unexpected PostgreSQL/transport failure.** Because `pages.id` is a PostgreSQL `SERIAL` (signed int32), Page read/update/delete service entrypoints must reject an impossible int64 identifier **before SQL**, retaining the established Page not-found contract rather than emitting an SQLSTATE 22003. Page service reads may not convert all database errors to `ErrPageNotFound`; public/admin controllers must preserve the existing fixed 404 text for confirmed absence or hidden drafts, while unknown read failures use redacted 5xx and trusted diagnostics. Numeric-looking Article slugs may fall back after a genuine missing-ID result, never after a database error. Media, Site and Taxonomy retain their existing fixed public validation/409 descriptions **only** through trusted `errors.Is`-classified sentinels, never a wrapped failure's raw text. Preserve multipart Media request/file size limits and distinguish malformed client data from underlying I/O faults. Never misclassify a Provider-generation failure as malformed JSON. Webhook parser errors retain fixed public descriptions without reflecting headers. Provider import bodies remain capped at 1 MiB. Audit all other capabilities independently; never mass-replace business response contracts or override the Connector hold.
- Gouno Core does not own this architecture. Blog owns `.gouno/codegen.yaml` and uses the project-defined `module` generator to create a minimal Capability Module skeleton. The manifest and `.gouno/codegen/` templates are the source of truth for Blog Codegen policy.
- `module` must remain structural and conservative: do not silently generate database access, routes, migrations, dependency injection, cross-capability imports, security policy, Connector behavior, or a mandatory `module.go` without a separately proven project convention.
- Preserve upstream/default `suite` semantics. Capability Module generation is expressed by Blog's distinct `module` command and must not be implemented by redefining `suite`.
- Any Codegen policy change must update the manifest, referenced templates, architecture documentation, and CI smoke verification together.
- Every backend architecture/Codegen batch must pass the repository's full backend, database-integration, dependency-review, compose, and unaffected frontend/seed gates before merge to `main`.
- Architecture and Codegen work never override Sections 1-5: the confidential BFF, identity/session rules, deployment contracts, and Connector Module Hold remain immutable unless the user explicitly changes them.

---

## Dependency Baseline Invariants

- Backend and Seed use the patched Go 1.27.x series, with a security floor of Go 1.27.2 after the October 8, 2026 standard-library advisories. Keep both `go.mod` directives, GitHub Actions `go-version-file` inputs and digest-pinned multi-architecture Docker builder versions aligned; `.github/scripts/check_go_toolchain_security.py` must fail CI on downgrade, tag drift or an unpinned builder. Never suppress reachable `govulncheck` findings as a substitute for patching.
- Backend `github.com/go-jose/go-jose/v4` must remain at **v4.1.6 or newer** following GHSA-mgcc-cww5-fp2q / CVE-2026-116587. Preserve verified module and go.mod checksums and exercise OIDC/JWK handling after updating. The 4.1.6 upstream RSA JWK modulus cap is 4096 bits by default; do not silently increase `MaxRSAModulusBits` to accept oversized untrusted keys.
- Runtime and builder Alpine packages in backend and Seed must pin patched `musl` and `musl-utils` to **1.2.6-r3 or newer** for CVE-2026-107891. Keep first-party immutable builder/runtime image digests and non-root execution. The Go toolchain security gate enforces both the go-jose and musl floors; never bypass a fresh Grype/Trivy finding by suppressing the scanner.
- Backend `golang.org/x/net` must remain at **v0.60.0 or newer** after the October 9, 2026 HTTP/2 advisories, with matching verified `go.sum` checksums and compatible `x/crypto`, `x/sys`, `x/term`, and `x/text` versions. The same toolchain security script enforces the vulnerable-module floor. Changes to security pins must pass `go mod verify`, `go vet`, race, `govulncheck`, and immutable image scans; never ignore reachable HTTP/2 findings.
- `blog-frontend` production and CI runtime is Node 24 LTS, with a project engine floor of Node 24.15 to satisfy the supported jsdom 30 toolchain. Keep `@types/node` on the same major. A future Node major migration must update Docker builders, CI setup, `package.json` engine metadata, lockfile metadata, and Node type declarations as one reviewed change.
- TypeScript 7.0 is the CLI compiler baseline but does not expose the legacy JavaScript Compiler API. Keep `@typescript/native` aliased to TypeScript 7 for `tsc`, while the `typescript` package key is aliased to `@typescript/typescript6` for repository AST/governance scripts. Do not collapse these into a single TypeScript 7 dependency until an explicit API migration is reviewed.
- Prettier `3.8.5` is an intentional governance pin while certified Product paths are frozen. Patch updates may be evaluated normally; formatter minor/major changes that rewrite certified Product source require an explicit certification-impact review before adoption rather than automatic dependency churn.
- Dependency freshness does not mean choosing the numerically highest major. Runtime, type declarations, compiler CLI, programmatic API consumers, production compatibility, immutable deployment inputs, and manual-first Showcase certification must remain aligned.

