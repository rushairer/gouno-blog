# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **implementation review complete; paired browser evidence pending**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Current Product baseline for this recertification: `rushairer/gouno-blog@be65840698a2bcc923563695245a9f70fe97bb2c`

Canonical reference: `rushairer/gouno-ui@c64c19f1a045545f54d988609a6ad2e80f2dfe6c`

This is the second non-AI Admin recertification wave under `SHOWCASE_PARITY_PROTOCOL.md`. Historical support-matrix coverage is supporting regression evidence only; it is not certification authority.

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

## Findings

| Surface | Manual finding | Classification | Decision |
| --- | --- | --- | --- |
| Categories collection | Table/mobile anatomy, selection, bulk actions, feedback and action ownership matched the Fixture closely. Manual review found raw typography roles and the absence of the named `collection-composition` contract. The typography portion was independently landed on main in `be658406` while this wave was in progress. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Keep the main typography fix; add the reviewed Collection Composition marker. |
| Categories Drawer | Product correctly owns real `autoFocus`, loading, validation and sort-order hint behavior. The form still lacked `editor-form-composition`; the Slug row lacked canonical `items-center`; the Slug input lacked `min-w-0 flex-1 font-mono`. | composition = `ui-drift`; Product validation/loading/hints = `intentional-product-divergence` | Restore only the canonical form/Slug-row composition and preserve Product behavior. |
| Tags collection | Grid/card/action/Modal structure was already aligned. Manual review found raw tag-title typography and no named collection marker. Typography was independently landed on main in `be658406`. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Keep the main typography fix; add Collection Composition marker. |
| Comments collection | Filter Card, list anatomy, moderation actions, selection, bulk actions and delete Modal were aligned. Manual review found raw typography and no named collection marker. Typography was independently landed on main in `be658406`. | typography = `ui-drift` (already landed); contract observability = `contract-drift` | Keep the main typography fix; add Collection Composition marker. |

## Intentional Product divergences retained

- Categories keeps real API validation, `autoFocus`, Slug loading, error handling and sort-order hint.
- Tags keeps real rename/merge/delete API behavior and AI workflow launching.
- Comments keeps URL-backed filters, real moderation/delete behavior, errors and Product notifications.
- Concrete data, counts, timestamps and list lengths may differ from Fixture data.

These differences must not be removed merely to make Product source literal-copy the Showcase.

## Final Wave 2 implementation

Starting from `be658406`:

- Categories root exposes `data-pattern="collection-composition"`.
- Categories Drawer exposes `data-pattern="editor-form-composition"`.
- Categories Slug row restores `items-center` and its input restores `min-w-0 flex-1 font-mono`.
- Tags root exposes `data-pattern="collection-composition"`.
- Comments root exposes `data-pattern="collection-composition"`.
- Existing main semantic-typography guards remain the typography authority; Wave 2 adds only missing composition guards.

## Durable evidence design

1. `check-admin-parity-contracts.mjs` extends the already-reviewed collection marker requirement to Categories / Tags / Comments and locks the Categories Drawer composition.
2. `showcase-parity.pw.mjs` compares Categories / Tags / Comments desktop light/dark composition and typography.
3. Categories parity opens both real Product and Showcase Drawers and compares the named editor-form composition plus Slug input typography.
4. A 390px paired pass covers Categories / Tags / Comments mobile surfaces, typography and horizontal overflow.
5. The existing support matrix continues to exercise support routes at 1440 / 1024 / 768 / 390 in light/dark; it remains supporting evidence rather than certification authority.

## Pending evidence

Before this wave can become `verified`:

- current-head CI must pass;
- Images must pass;
- Blog Showcase Parity must pass with the Wave 2 tests;
- UI Browser Acceptance must pass;
- paired desktop/mobile/Drawer artifacts must be downloaded and manually inspected;
- only then may the certification ledger record reviewed refs and accepted evidence IDs.
