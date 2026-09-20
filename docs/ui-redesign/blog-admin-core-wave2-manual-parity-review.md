# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **implementation review complete; paired browser evidence pending**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Product baseline before this review: `rushairer/gouno-blog@ee046e3ad9398ae8cd5322403f09ca7aaf1d2fc0`

Canonical reference: `rushairer/gouno-ui@c64c19f1a045545f54d988609a6ad2e80f2dfe6c`

This is the second non-AI Admin recertification wave under `SHOWCASE_PARITY_PROTOCOL.md`. The older support matrix remains regression evidence only; it was not treated as proof of Showcase parity.

## Manual review method

The current Showcase fixtures and Product implementations were read side-by-side before editing. Review dimensions:

- collection composition and page-stack ownership;
- semantic typography roles;
- spacing/rhythm ownership;
- feedback / loading / empty-state ownership;
- selection and bulk-action grammar;
- Drawer / Modal form composition;
- desktop/mobile responsive structure;
- Product-only business behavior that must be preserved.

## Findings

| Surface | Manual finding | Classification | Decision |
| --- | --- | --- | --- |
| Categories collection | Table/mobile anatomy, selection, bulk actions, empty/loading/error behavior and action ownership were already close to the Fixture. Product still used raw `text-sm`, `text-xs`, `font-semibold`, `font-mono` roles after Showcase moved to semantic typography. Product also lacked the named `collection-composition` marker. | typography = `ui-drift`; contract observability = `contract-drift` | Restore semantic type roles and expose the reviewed Collection Composition marker. |
| Categories Drawer | Product retained the correct field set plus legitimate real-product behavior such as `autoFocus`, loading state and a sort-order hint. However the form lacked the canonical `editor-form-composition` marker; the Slug row used plain `flex gap-2` rather than `items-center`; the Slug input did not retain canonical `min-w-0 flex-1 font-mono` ownership. | composition = `ui-drift`; real validation/loading/hints = `intentional-product-divergence` | Restore canonical form/Slug-row composition while preserving Product behavior. |
| Tags collection | Card grid, selection, action hierarchy, rename/merge/delete Modals and Product API behavior were already aligned in structure. Tag title still used raw `text-sm font-semibold`; root lacked `collection-composition`. | typography = `ui-drift`; contract observability = `contract-drift` | Restore semantic title role and collection marker only. |
| Comments collection | Filter Card, selection, bulk action, moderation actions, delete Modal and list anatomy were structurally aligned. Avatar/author/time/post/content typography remained on raw utilities and root lacked `collection-composition`. | typography = `ui-drift`; contract observability = `contract-drift` | Restore semantic type roles and collection marker. |

## Intentional Product divergences retained

- Categories uses real API validation, `autoFocus`, Slug loading state, error handling and sort-order hint.
- Tags uses real rename/merge/delete API state and AI workflow launching.
- Comments uses URL-backed filters, real moderation/delete operations, real error handling and Product notifications.
- Concrete data, counts, timestamps and list lengths may differ from Fixture data.

These differences must not be removed merely to make Product source text identical to Showcase source.

## Fixes extracted from the manual review

- Categories:
  - root → `data-pattern="collection-composition"`;
  - table/mobile typography → semantic `type-*` roles;
  - Drawer stack → `data-pattern="editor-form-composition"`;
  - Slug row → `items-center`;
  - Slug input → `min-w-0 flex-1 font-mono`.
- Tags:
  - root → `data-pattern="collection-composition"`;
  - tag title → `type-body-sm type-weight-semibold`.
- Comments:
  - root → `data-pattern="collection-composition"`;
  - avatar/author → `type-body-sm type-weight-semibold`;
  - timestamp/post reference → `type-family-mono type-caption`;
  - content → `type-body-sm type-leading-relaxed`.

## Durable guard design

The conclusions are encoded only after the manual classification:

1. `check-admin-parity-contracts.mjs` requires the three Collection Composition markers, the Categories EditorForm/Slug-row anatomy and reviewed semantic typography.
2. `showcase-parity.pw.mjs` compares desktop light/dark collection anatomy and typography for Categories, Tags and Comments.
3. Categories paired parity opens the real Product Drawer and Showcase Drawer and compares the named editor-form composition plus Slug input typography.
4. A 390px paired pass covers Categories, Tags and Comments mobile surfaces and horizontal overflow.
5. Existing support-matrix coverage remains useful for loading/data behavior across 1440/1024/768/390 and light/dark, but it is supporting evidence rather than certification authority.

## Pending evidence

Before this wave can become `verified`:

- current-head CI must pass;
- Images must pass;
- Blog Showcase Parity must pass with the new Wave 2 tests;
- UI Browser Acceptance must pass;
- paired desktop/mobile/Drawer screenshots must be downloaded and manually inspected;
- the certification ledger must then be updated with reviewed refs and accepted evidence IDs.
