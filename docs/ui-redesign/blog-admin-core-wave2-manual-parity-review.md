# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **implementation review complete; paired browser evidence pending**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Current Product baseline for this recertification: `rushairer/gouno-blog@f4aa93f3c18e53e8f69b0125f2859009161dd4fc`

Canonical reference: `rushairer/gouno-ui@c64c19f1a045545f54d988609a6ad2e80f2dfe6c`

This is the second non-AI Admin recertification wave under `SHOWCASE_PARITY_PROTOCOL.md`.

## Manual review method

The current Showcase fixtures and Product pages were read side-by-side before finalizing the Wave 2 scope. The review covered:

- collection composition and page-stack ownership;
- semantic typography roles;
- spacing/rhythm ownership;
- loading / empty / error / selection states;
- bulk-action grammar;
- Drawer / Modal form composition;
- desktop/mobile responsive structure;
- Product-only validation, routing, API and AI behavior that must remain real.

Historical support-matrix coverage was treated as regression evidence only. During this review, main independently landed semantic support typography and then introduced `support-showcase-parity.pw.mjs`; Wave 2 reuses those improvements instead of duplicating them.

## Findings

| Surface | Manual finding | Classification | Decision |
| --- | --- | --- | --- |
| Categories collection | Table/mobile anatomy, selection, bulk actions, feedback and action ownership matched the Fixture closely. Manual review found raw typography roles and absence of the named `collection-composition` contract. Typography was independently corrected on main before this final Wave 2 branch. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Reuse main typography; add the reviewed Collection Composition marker. |
| Categories Drawer | Product correctly owns real `autoFocus`, Slug loading, validation and sort-order hint behavior. The form still lacked `editor-form-composition`; the Slug row lacked canonical `items-center`; the Slug input lacked `min-w-0 flex-1 font-mono`. | composition = `ui-drift`; Product validation/loading/hints = `intentional-product-divergence` | Restore only canonical form/Slug-row composition and preserve Product behavior. |
| Tags collection | Grid/card/action/Modal structure was already aligned. Manual review found raw tag-title typography and no named collection marker. Typography was independently corrected on main. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Reuse main typography; add Collection Composition marker. |
| Comments collection | Filter Card, list anatomy, moderation actions, selection, bulk actions and delete Modal were aligned. Manual review found raw typography and no named collection marker. Typography was independently corrected on main. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Reuse main typography; add Collection Composition marker. |

## Intentional Product divergences retained

- Categories keeps real API validation, `autoFocus`, Slug loading, error handling and sort-order hint.
- Tags keeps real rename/merge/delete API behavior and AI workflow launching.
- Comments keeps URL-backed filters, real moderation/delete behavior, errors and Product notifications.
- Concrete data, counts, timestamps and list lengths may differ from Fixture data.

These differences must not be removed merely to make Product source literal-copy the Showcase.

## Final Wave 2 implementation

Starting from `f4aa93f3`:

- Categories root exposes `data-pattern="collection-composition"`.
- Categories Drawer exposes `data-pattern="editor-form-composition"`.
- Categories Slug row restores `items-center`; its input restores `min-w-0 flex-1 font-mono`.
- Tags root exposes `data-pattern="collection-composition"`.
- Comments root exposes `data-pattern="collection-composition"`.
- Existing main semantic-typography guards remain the typography authority.
- Existing `support-showcase-parity.pw.mjs` remains the desktop support-surface parity authority; Wave 2 extends it instead of creating a second test corpus.

## Durable evidence design

1. `check-admin-parity-contracts.mjs` extends the reviewed collection marker requirement to Categories / Tags / Comments and locks the Categories Drawer composition.
2. Existing support parity keeps desktop light/dark Categories / Tags / Comments style comparisons.
3. Categories support parity now also opens both Drawers and compares `editor-form-composition` plus Slug input style.
4. A 390px paired pass covers Categories / Tags / Comments mobile surfaces and horizontal overflow.
5. Existing support matrix continues to exercise 1440 / 1024 / 768 / 390 in light/dark; it remains supporting evidence, not certification authority.

## Pending evidence

Before this wave can become `verified`:

- current-head CI must pass;
- Images must pass;
- Blog Showcase Parity must pass with the extended support parity corpus;
- UI Browser Acceptance must pass;
- paired desktop/mobile/Drawer artifacts must be downloaded and manually inspected;
- only then may the certification ledger record reviewed refs and accepted evidence IDs.
