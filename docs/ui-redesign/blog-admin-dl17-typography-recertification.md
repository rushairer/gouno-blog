# Blog Admin CSA-A003 / CSA-A004 Recertification

Status: **Product synchronized / manual browser recertification pending**

Date: 2026-09-23

## Trigger

Two accepted post-freeze Canonical amendments now affect already-certified Blog Admin ownership and are intentionally being propagated as one Consumer batch to avoid repeated reverse-migration and CI cycles.

### CSA-A003 — DL-17 semantic Typography hardening

Canonical correction:

- merge commit `39e781245082728aaf06141a81f26a9095f0eaf0`;
- the frozen Blog Admin Canonical corpus no longer rebuilds governed font size, weight, family, line-height or tracking with raw `text-*`, `font-*`, `leading-*` or `tracking-*` utilities;
- the Canonical guard now rejects those raw utilities across the complete Blog Admin Showcase ownership set.

The Product audit confirmed the direct Canonical seams plus additional Product-owned raw typography inside the already-certified AI component corpus. Because `blog-admin-ai` owns `blog-frontend/src/components/agent/`, leaving those Product-only residuals in place would make a restored certification misleading even if the direct Canonical diff had been copied correctly.

### CSA-A004 — Master/Detail mobile drill-in correction

Canonical correction:

- implementation merge `69019c4175bde817d56c5037f95fbc382b122c98`;
- accepted governance/main ref `2ba6b3284e989f29d9501a1670f2494a44f9e670`;
- desktop remains dual-pane;
- tablet (768–1279) remains stacked;
- mobile (<768) shows one active pane with an explicit return path;
- AI Operations Decision Inbox uses Queue → Workbench drill-in;
- Workflow/Agent Run Center uses Run List → Run Detail drill-in;
- page-level filters remain outside the rail and stay visible.

## Affected certification waves

- `blog-admin-ai` — CSA-A003 + CSA-A004;
- `blog-admin-core-wave1` — CSA-A003;
- `blog-admin-core-wave2` — CSA-A003;
- `blog-admin-core-wave3` — CSA-A003.

All four remain `needs-manual-recertification` until fresh Product browser evidence is retained and reviewed.

## Product synchronization in this branch

### Core Blog Admin

The A003 semantic substitutions are propagated to:

- Dashboard Top Posts rank/title/metrics;
- Post Editor history item density and Slug input;
- Page Editor Slug input;
- Categories Slug editor;
- Tags count badge;
- Media Library blocked-reference list;
- Site Settings RSS input.

The current frozen Core page corpus is guarded against new raw DL-17 utilities.

### AI Settings / AI Operations

The Product-owned AI corpus is migrated as an ownership unit rather than only copying two Canonical lines.

Semantic substitutions follow the accepted Gouno UI roles:

- `text-xs` → `type-caption`;
- `text-sm` → `type-body-sm`;
- `font-medium` → `type-weight-medium`;
- `font-normal` → `type-weight-regular`;
- `font-mono` → `type-family-mono`;
- the “items to decide” numeric summary uses `type-metric-value`.

The Product parity guard recursively scans production `components/agent/**/*.tsx`, plus the governed Admin route pages, and rejects future raw DL-17 typography utilities.

### Mobile Master/Detail

Product bindings preserve real API/data ownership while adopting the accepted A004 navigation contract:

- Decision Inbox starts Queue-first on mobile even when desktop selection context is already preselected.
- Selecting a decision switches to one Workbench pane; `返回决策队列 / Back to decision queue` returns to the rail.
- Workflow Run Center may preload the first Run for desktop context without forcing mobile into Detail; a user row click or explicit `run=` deep link opens mobile Detail.
- Workflow filters return mobile ownership to the Run list and clear the `run` deep link.
- Agent Run Center keeps real loaded selection state while mobile pane navigation is independent; returning to the list clears `run=` without discarding loaded detail data.
- Deleting the active Agent Run clears the stale `run=` URL state.
- `md+` behavior is preserved so tablet stacked and desktop dual-pane layouts do not regress.

## Regression protection prepared before PR

- structural parity guard for the A004 `data-mobile-pane`, rail/detail ownership and explicit return actions;
- recursive DL-17 corpus guard for AI production TSX;
- DL-17 guard for the governed Core/Admin pages;
- unit coverage for Decision Inbox, Workflow Run Center and Agent Run Center master → detail → master transitions;
- Product browser acceptance coverage at 390px for Inbox, Workflow Run and Agent Run;
- existing 768px Workflow evidence is retained to prove tablet behavior remains stacked rather than inheriting the mobile single-pane contract.

## Pending acceptance

No certification is restored by this implementation document alone.

The next step is one Consumer PR that runs:

- CI / Frontend quality;
- Images;
- Blog Showcase Parity;
- UI Browser Acceptance.

After the exact implementation head is green:

1. download the retained Showcase/Product parity and Product browser artifacts;
2. manually review the affected Typography states and the three mobile Master/Detail paths;
3. update all four certification entries together with the exact Blog implementation ref, current Gouno UI Canonical ref, workflow IDs and artifact digests;
4. restore `verified` only in that evidence-backed certification commit;
5. run the certification/freshness gates once more, then merge.

Previous certification documents remain historical evidence and are not rewritten.
