# Gouno Blog Public & Account Showcase Parity Hardening

Status: **Complete / accepted.**

Accepted on 2026-09-16 (Asia/Shanghai). This document records the final engineering evidence for the Public Blog + Blog Account Showcase Parity Hardening pass. Historical migration reports are background only; the accepted source of truth is the GitHub `main` state and the CI evidence recorded below.

## 1. Baseline and accepted refs

| Item | Baseline | Accepted |
| --- | --- | --- |
| `rushairer/gouno-ui` | `7e8872a4a216191ce56cf34ed3c3827c03645c37` | `4bc9c518626a1c37b3e3e1e5756a5cd7c0f9dd3d` via PR #80 |
| `rushairer/gouno-blog` | `3d41e31aca080321457eed9a79dee5f25dec25c6` | product/code acceptance SHA `8977f0adb033b9630b2795924998f475cb23a522` via PR #249 |
| Supporting Blog parity harness fix | n/a | `f19d29936b35cd2a558ad61439e0e29471271612` via PR #252 |
| `@gouno/ui` package | `0.4.1` | still exact `0.4.1` |

No published `@gouno/ui` package API changed in this hardening pass. The Gouno UI changes are Showcase/test-contract changes, so no package version bump or package release was required.

The execution environment did not expose an interactive Browser connector. Rendered verification therefore uses the repository Playwright suites in GitHub Actions plus retained screenshots/traces. Those fixture sessions are deterministic browser acceptance evidence; they are not a substitute for production-authenticated end-to-end SSO testing.

## 2. Canonical route inventory

| Family | Showcase owner | Product route / owner | Accepted contract |
| --- | --- | --- | --- |
| Home | `showcase/demos/products/blog/home.tsx` | `/` → `src/pages/Home.tsx` | direct parity + public matrix |
| Article Index | `blog/article-index.tsx` | `/articles` → `ArticleIndex.tsx` | shared route family |
| Search | `blog/article-index.tsx` | `/search?q=...` → `ArticleIndex mode=search` | shared route family; query preserved |
| Category Detail | `blog/article-index.tsx` | `/categories/:slug` → `ArticleIndex mode=category` | shared route family |
| Tag Detail | `blog/article-index.tsx` | `/tags/:slug` → `ArticleIndex mode=tag` | shared route family |
| Categories Index | `blog/discovery-indexes.tsx` | `/categories` → `Categories.tsx` | discovery grammar |
| Tags Index | `blog/discovery-indexes.tsx` | `/tags` → `Tags.tsx` | discovery grammar |
| Archive | `blog/discovery-indexes.tsx` | `/archive` → `Archive.tsx` | discovery grammar |
| Article Detail | `blog/article-detail.tsx` + `article-community.tsx` | `/articles/:slug` → `PostDetail.tsx` | reading + community grammar |
| About | `blog/document-pages.tsx` | `/about` → `CustomPageView fixedSlug=about` | Blog-local document grammar + Product lifecycle |
| Custom Page | `blog/document-pages.tsx` | `/:slug` → `CustomPageView.tsx` | dynamic document lifecycle; specific routes win first |
| Account Notifications | `blog/account-pages.tsx` | `/account/notifications` → `AccountNotifications.tsx` | authenticated public-account grammar |
| Account Settings | `blog/account-pages.tsx` | `/account/settings` → `Settings.tsx` | identity/security ownership handoff |
| Not Found | `blog/not-found.tsx` | `*` → `NotFound.tsx` | canonical Result/navigation grammar |

Redirect-only compatibility routes remain `/notifications` → `/account/notifications` and `/settings` → `/account/settings`. They are routing contracts, not separate Showcase pages.

## 3. Product-only contracts preserved

The hardening pass intentionally did **not** fabricate 1:1 Showcase pages for Product-only runtime/security behavior. The following remain Blog Product responsibilities:

- root `GossoProvider` session restoration;
- `RequireAuth` redirect-target preservation for `/account/*`;
- Step-Up popup callback handling;
- runtime site metadata/bootstrap and custom navigation data;
- unpublished article preview authorization;
- article mutation authorization and backend failures;
- SEO, canonical URL and social metadata side effects.

OAuth/OIDC, cookie/session, redirect, Step-Up, preview and permission semantics were not redesigned by this work.

## 4. Final reading and account contracts

Public Blog remains an editorial/product surface rather than an Admin shell. It does not use `AppShell` or Admin `PageContainer` grammar. `PublicShell`, article/document/community orchestration and TOC composition remain Blog-owned instead of being promoted into new Gouno Pattern/Gouno APIs.

Article Detail now keeps one dominant `Card as="article"` reading surface. Markdown remains Blog-owned, while canonical code framing/copy behavior is delegated to Core `CodeBlock`. Article and document TOC navigation delegates to Core `Anchor`. Comment loading/failure is modeled separately from successful Empty state; report failure remains in the report modal; like/comment/report mutation feedback does not replace the reading surface. Explicit HTTP 404 is distinguished from transport/server failure for both articles and custom pages.

Blog Account Notifications now has route-shaped Skeleton loading, persistent load error separate from transient mutation error, real mark-one and mark-all-read behavior, and preserves already-loaded data when a mutation fails. It deliberately does not absorb Admin notification-management features such as delete/clear.

Blog Account Settings remains an explicit GOSSO ownership handoff. No password, MFA, Passkey, identity-session or fabricated profile/preferences form was added because the current Blog backend exposes no real Blog-local editable profile/preferences API.

## 5. Mismatch closure ledger

Initial ledger: **P0 = 8, P1 = 14**. Final ledger: **P0 = 0, P1 = 0**.

| ID | Final resolution | Durable guard | Status |
| --- | --- | --- | --- |
| PUB-001 | removed PublicShell canonical-control geometry takeover | Public AST + direct shell parity | resolved |
| PUB-002 | article-index filter/navigation grammar reconciled without changing route semantics | Showcase tests + direct parity | resolved |
| PUB-003 | discovery loading changed from generic Spinner to route-shaped Skeleton | Public contract + browser matrix | resolved |
| PUB-004 | discovery request failure is explicit recoverable Error + retry, never successful Empty | interaction test + Showcase error scenario | resolved |
| PUB-005 | Markdown code frame/copy ownership delegated to Core `CodeBlock`; syntax adapter remains Blog-owned | AST ownership contract + copy interaction | resolved |
| PUB-006 | article/document TOC navigation delegated to Core `Anchor` | AST + direct article parity | resolved |
| PUB-007 | comment load failure modeled separately from Empty while reading remains available | interaction + structural contract | resolved |
| PUB-008 | community composition reconciled to canonical Card/Alert grammar while orchestration stays Blog-owned | direct article/community parity | resolved |
| PUB-009 | like/comment/report pending/failure ownership separated; report failure remains modal-local | rendered interactions | resolved |
| PUB-010 | Account Notifications uses route-shaped Skeleton | account matrix + structural contract | resolved |
| PUB-011 | page-load and mutation errors split; mark-one failure preserves loaded list | rendered mutation test | resolved |
| PUB-012 | supported mark-all-read behavior exposed without Admin-management surface | rendered interaction + source contract | resolved |
| PUB-013 | fictional editable Account Settings removed from canonical Showcase; Product remains identity handoff | direct account parity | resolved |
| PUB-014 | fictional hand-rolled preference switch surface removed rather than promoting non-existent capability | Showcase conformance tests | resolved |
| PUB-015 | CustomPage/About loading is route-shaped; 404 vs transport failure separated; retry preserved | AST + interaction + direct parity | resolved |
| PUB-016 | account routes added to matrix: original 96 retained + 16 account cases = 112 | UI Browser Acceptance | resolved |
| PUB-017 | high-risk Public/Account interactions expanded from 5 to 15 | UI Browser Acceptance | resolved |
| PUB-018 | `check-public-parity-contracts.mjs` added and wired into `lint:ui` | static CI | resolved |
| PUB-019 | Public/Account direct Showcase parity added with shared style/geometry helpers and screenshots | Blog Showcase Parity | resolved |
| PUB-020 | reciprocal Gouno UI Blog Consumer Parity now executes the same Admin + privileged + Public/Account config | Gouno UI CI | resolved |
| PUB-021 | workflow/artifact ownership renamed from Blog Admin Showcase Parity to Blog Showcase Parity | workflow contract | resolved |
| PUB-022 | semantic headings/nav/hash/form/dialog/overflow behavior receives focused source and browser assertions | AST + Playwright | resolved |

## 6. Static and structural guardrails

`blog-frontend/scripts/check-public-parity-contracts.mjs` governs 14 Public/Account source files and is part of `lint:ui`. It prevents Public/Account use of Admin `AppShell`/`PageContainer`, native visible controls that bypass canonical Gouno UI primitives, important-utility geometry takeovers on canonical controls, local `CodeBlock`/clipboard recreation, raw code elevation, ambiguous article/custom-page 404 handling, and identity/security forms in Blog Account Settings.

It also requires the semantic PublicShell (`header`, `main#public-main`, `footer`, desktop/mobile navigation and Drawer), one dominant Article Detail `Card as="article"`, Blog-local Markdown renderer, explicit comment loading/error ownership, Core `Anchor` TOCs, route-shaped Account/CustomPage loading, notification mark-all wiring, and the explicit GOSSO account-management handoff.

Existing generic UI, retired-class, Admin parity and privileged-access contracts remain in the same `lint:ui` chain; none were removed or weakened.

## 7. Rendered browser and direct parity evidence

### UI Browser Acceptance

Accepted Blog main SHA: `8977f0adb033b9630b2795924998f475cb23a522`.

- Run: `34999141877`, job `104482871162`.
- Result: **335 / 335 passed**.
- Public route/theme/viewport matrix: **112 cases** = 14 routes × 4 viewports (`1440x900`, `1024x768`, `768x1024`, `390x844`) × light/dark.
- The original 96 public cases were retained; `/account/notifications` and `/account/settings` add 16 authenticated fixture cases.
- Focused Public/Account interaction coverage: **15 flows**, including mobile nav, search, tag navigation, discovery recovery, article responsive containment, article transport recovery, TOC hash navigation, Core CodeBlock copy, like/comment mutation, report-modal failure, runtime custom navigation, custom-page recovery, notification mutation failure, mark-all, account identity handoff and NotFound navigation.
- Evidence artifact: `blog-browser-acceptance-34999141877`, artifact ID `10408329419`.

### Blog → Showcase direct parity

- Workflow: `Blog Showcase Parity` run `34999141733`, job `104482869936`.
- Checkout pair: Blog `8977f0adb033b9630b2795924998f475cb23a522` + Gouno UI `4bc9c518626a1c37b3e3e1e5756a5cd7c0f9dd3d`.
- Result: **48 / 48 passed**.
- Breakdown: **10 privileged-access + 24 Public/Account + 14 existing Blog Admin** tests.
- Public/Account surfaces: Home, Articles, Search, Categories, Tags, Archive, Article Detail, About, Custom Page, Account Notifications, Account Settings and NotFound in light/dark.
- Gate compares semantic structure, computed-style fingerprints (including typography), stable geometry and paired screenshots; it intentionally does not require full-page zero-pixel equality.
- Evidence artifact: `blog-showcase-parity-34999141733`, artifact ID `10407914831`.

### Gouno UI → Blog reciprocal consumer parity

After both product/canonical changes were on `main`, the Gouno UI `Blog Consumer Parity` workflow was rerun against the final pair rather than relying on the earlier Admin-only result.

- Run: `34995964495`, rerun job `104604141306`.
- Checkout pair: current Blog main `8977f0adb033b9630b2795924998f475cb23a522` + candidate/current Gouno UI main `4bc9c518626a1c37b3e3e1e5756a5cd7c0f9dd3d`.
- Result: **48 / 48 passed** with the same 10 + 24 + 14 split.
- Evidence artifact: `gouno-ui-blog-consumer-parity-34995964495`, artifact ID `10422884359`.

This closes reciprocal protection: relevant Gouno UI changes are now checked against the current Blog consumer across Blog Admin, privileged-access and Public/Account surfaces.

## 8. SEO and accessibility durability

The rendered/public contracts now protect semantic H1 presence, desktop/mobile navigation labeling, `aria-current` route behavior, real hash navigation for article TOC, modal/form ownership for report flows, and absence of document-level horizontal overflow across all 112 matrix cases. Account Settings is also guarded against accidental reintroduction of password/MFA/Passkey/session forms.

Runtime SEO/canonical/social metadata remains Product-owned and is intentionally not replaced with a fake Showcase lifecycle. The hardening work preserved rather than relocated those side effects.

## 9. Main CI evidence

| Repository / gate | Accepted ref | Result |
| --- | --- | --- |
| Blog CI | `8977f0adb033b9630b2795924998f475cb23a522` | run `34999141826` success |
| Blog UI Browser Acceptance | same | run `34999141877`: 335/335 passed |
| Blog Showcase Parity | same + UI `4bc9c518...` | run `34999141733`: 48/48 passed |
| Gouno UI CI / PR #80 | canonical branch before merge | success |
| Gouno UI Gosso Admin Consumer Parity / PR #80 | canonical branch before merge | success |
| Gouno UI reciprocal Blog Consumer Parity | UI `4bc9c518...` + Blog `8977f0ad...` | run `34995964495`: 48/48 passed |

No test was skipped to obtain acceptance, no coverage threshold was raised, and the existing Blog Admin direct parity remained active and green inside the final 48-test rendered parity suite.

## 10. Representative staged commits

The work was intentionally split into reviewable phases instead of one large change. Representative commits include:

- Gouno UI: `329e81f` canonical account fixture reconciliation; `a135a9e` public navigation/discovery hardening; `617010b` public-shell source contract correction; `4d434ea` semantic assertion alignment; merged via PR #80 to `4bc9c518...`.
- Blog Product/state: `0dee50d` discovery/account states; `abc8241` Core CodeBlock ownership; `ed4240c` article/community ownership; `a115c1e` custom document lifecycle; `48c106a` article transport-vs-404 distinction.
- Blog contracts/browser: `d9f81c8` Public structural contract; `ba20fa3` account matrix; `e62f46c` Public/Account interactions; `48bb8c3` shared parity helpers; `c86241b` typography fingerprinting; `871224e` deterministic rendered locale; `6f38cc9` Public Showcase coverage.
- Supporting harness fix: PR #252 merged as `f19d2993...`, narrowing privileged Alert matching to the `SudoGate`-owned direct child without changing Admin Product UI.
- Blog hardening merged through PR #249 as `8977f0ad...`.

## 11. Intentional differences and residual risks

The Product dynamic CustomPage may expose a Blog-owned TOC when its content provides headings; the canonical document fixture does not need to fabricate that Product lifecycle. Direct parity therefore validates the shared document surface while allowing Product-owned TOC composition.

Literal fixture copy/data is not required to match Product data. Parity is defined around ownership, structure, state presentation, interaction grammar, computed styles and stable geometry.

The browser suites use deterministic mocked Blog sessions. Real IdP login, external redirects and production cookies remain separate security/integration concerns.

CI dependency installation currently reports existing npm audit warnings in the Blog dependency graph (`3 moderate`; the temporary isolated Playwright augmentation reports `5` total: `3 moderate`, `2 high`). This hardening pass did not change dependency versions to hide or bypass those advisories; dependency remediation should remain a separate, explicit maintenance task. GitHub Actions also reports the current Node 20 action-runtime deprecation warning while the runner executes Node 24; it is not a parity-test failure.

## 12. Final acceptance

All originally recorded P0/P1 Public & Account Showcase parity gaps are closed: **P0 = 0, P1 = 0**.

The accepted contract is now:

```text
Gouno UI Primitive
        ↓
Canonical Blog Public / Account Showcase
        ↓
 ┌───────────────────────┐
 │                       │
Showcase             Blog Product
 │                       │
 └── Direct Parity ──────┘
        ↓
Static / Structural / State / Browser Contracts
        ↓
Reciprocal Gouno UI Consumer Parity
```

Blog Admin hardening remains green, Public/Account has its own product-appropriate grammar, and both repositories now have durable CI evidence against future drift.
