# React shared Hook correctness — MFA draft snapshots and article SEO (2026-10-15)

Part of [A+ frontend React correctness #359](https://github.com/rushairer/gouno-blog/issues/359), based on main `1bcae8ba9942eaf6412bb716c308e760e2ec2888`, after the measured 500 kB chunk-budget merge [#367](https://github.com/rushairer/gouno-blog/pull/367).

This changes only **shared Hook implementation and tests**, not any `verified` certification's Product-owned source, canonical `@gouno/ui` pattern/DOM/CSS, BFF/OIDC contract or frozen Connector module. Nevertheless both Hooks feed important visible UX, so end-to-end and actual Showcase/Browser parity gates are mandatory.

## Problems confirmed by source analysis

1. `src/hooks/useFormDraft.ts` wrote `valueRef.current = value` **during React render**. This violates React's ref purity: an interrupted or discarded concurrent render may change the value observed by an event handler before that state has committed. The Step-Up MFA handoff can snapshot form state that was never committed. In React 19 strict/concurrent scenarios, prefer event callbacks whose closure represents committed render state instead of mutating refs during render.
2. `src/utils/seo.ts` updated `siteBrand` on `SITE_SETTINGS_UPDATED_EVENT`, but the effect that writes the document title, canonical URL, Open Graph tags and structured article metadata depended only on `[article, brand]`. A site title update with the same article and no brand override did not rerun the effect, leaving the browser title/SEO stale. With an explicit `brand` override, the listener was also detached, so removing the override could restore the old site name. A separate synchronous effect set-state for `brand` was redundant and triggers the React set-state-in-effect warning.

## Changes

- `useFormDraft`: `save` now closes over the **latest committed `value`**, and the Step-Up event listener follows the committed callback via `useEffect` dependencies. Preserve `enabled`, `autoRestore`, explicit `saveDraft(value)`, `clearDraft`, merge-on-restore and key-local persistence. The remaining `hasRestoredRef` is used only in effect logic, not changed during render. No browser/API token handling is changed.
- `useArticleSEO`: initialize fallback site title from cache, subscribe to site-settings updates throughout the Hook lifetime even when an explicit override is present; derive `currentBrand` synchronously in render from `brand || siteBrand || cachedBrand`; make the document head effect depend on `[article, currentBrand]`. No synchronous `setState` inside a mount effect. Keep canonical URL, OpenGraph, JSON-LD article metadata and cleanup/restore contracts unchanged.
- Real renderHook tests: Step-Up snapshots the latest **committed** value after rerender, isolates form draft keys, honors `enabled=false`, and preserves explicit save. SEO updates browser title on site-title event, respects and releases an explicit brand override, keeps a single JSON-LD script, restores prior head state on unmount and does nothing without article.

## Mandatory exact-head acceptance

- `blog-frontend`: Prettier check, TypeScript 7 CLI, Oxlint and **record actual count vs previous 74 warnings (no disabling rules)**, all Vitest/coverage, UI/CSS contracts, built 500 kB chunk budget and static dependency cycles.
- Full `UI Browser Acceptance` (real Chromium, 344+ cases) and `Blog Showcase Parity` because these hooks affect public SEO and AI Settings Step-Up form flows. Do **not** auto-promote or mark previously verified Product pages as newly manually certified.
- Existing backend+Seed Go1.27.2 tests/race/vet/module verification/govulncheck, `authbff` 80% ratchet, actual disposable PostgreSQL **115 required/0 failed/skipped/missing**, missing-DSN/unknown-DB/invalid-schema false-green probes, backend/frontend/Seed Docker builds with six Trivy/Grype scans. This frontend-only diff does not trigger Gosso Release BFF Compatibility and it must not be counted as a newly passed check if absent.

## Explicitly still open

The majority of the 74 React/Oxlint warnings are in certified Product paths: especially `AIOperations.tsx`'s inspect-run callback/effects and other editor/ref issues. Those cannot be bulk rewritten and declared `verified` on automation alone. They need narrowly reviewed logic and fresh manual product-state recertification if Product-owned source changes. No Connector changes or lint waivers. `#338` human operator Provider/Media recovery signoff and `#359` full release security/architecture attestation remain open.
