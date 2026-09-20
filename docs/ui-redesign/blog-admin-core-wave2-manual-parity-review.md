# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **implementation review complete; paired browser evidence pending**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Current Product baseline for this recertification: `rushairer/gouno-blog@e2c1e6bfbb17cc04b33bafc656aab7493406002e`

Canonical reference: `rushairer/gouno-ui@c64c19f1a045545f54d988609a6ad2e80f2dfe6c`

This is the second non-AI Blog Admin recertification wave under `SHOWCASE_PARITY_PROTOCOL.md`.

## Manual review method

The current Showcase fixtures and Product implementations were reviewed side-by-side before finalizing this wave. The review covered:

- collection composition and page-stack ownership;
- semantic typography roles;
- selection and bulk-action grammar;
- loading / empty / error states;
- Categories Drawer form anatomy;
- desktop and 390px mobile rendering;
- Product-owned API, routing, AI and validation behavior that must remain real.

Historical support-matrix tests were treated as regression evidence rather than certification authority.

## Mainline work absorbed during the review

Several findings were independently fixed on main while this review was in progress. The final Wave 2 branch intentionally reuses them instead of replaying them:

- Categories / Tags / Comments semantic support typography;
- Categories / Tags / Comments `collection-composition` ownership;
- Categories `editor-form-composition` ownership;
- support-surface rendered parity corpus;
- fixture-cardinality-safe table parity;
- canonical Users identity-row alignment;
- support composition markers for MediaLibrary / Users and `settings-composition` for SiteSettings.

The final Wave 2 diff therefore contains only the remaining reviewed gap and its evidence.

## Findings

| Surface | Manual finding | Classification | Final decision |
| --- | --- | --- | --- |
| Categories collection | Collection/table/mobile structure and semantic typography are now owned by current main. | already covered | Reuse main; do not duplicate Product changes. |
| Categories Drawer | The named editor composition is present, but the Slug row still used plain `flex gap-2`, and the Slug input lacked the canonical flexible monospace ownership. | `ui-drift` | Restore `items-center` on the row and `min-w-0 flex-1 font-mono` on the input. Preserve real validation, loading, hint and API behavior. |
| Tags collection | Grid/card/action hierarchy, semantic typography and collection marker are now aligned by current main. | already covered | No Product source change in final Wave 2. |
| Comments collection | Filter/list/moderation hierarchy, semantic typography and collection marker are now aligned by current main. | already covered | No Product source change in final Wave 2. |

## Intentional Product divergences retained

- Categories retains real API validation, `autoFocus`, Slug generation/loading, error handling and sort-order hint.
- Tags retains real rename/merge/delete API state and AI workflow launching.
- Comments retains URL-backed filters, real moderation/delete operations, real errors and Product notifications.
- Concrete data, counts, timestamps and list lengths may differ from Fixture data.

These are Product-owned behaviors, not parity defects.

## Final Wave 2 implementation

Starting from `e2c1e6bf`:

- Categories Slug row → `flex items-center gap-2`;
- Categories Slug input → `min-w-0 flex-1 font-mono`;
- the Admin static parity guard locks those reviewed Slug markers;
- existing support parity opens the Categories Drawer in light/dark and compares the named editor composition plus the exact Slug textbox;
- a 390px light paired pass covers Categories / Tags / Comments and horizontal overflow.

The rendered test deliberately uses:

`getByRole("textbox", { name: "Slug 标识", exact: true })`

rather than the earlier broad label locator. The earlier locator matched two elements and produced a harness false positive; it was not a Product defect.

## Pending evidence

Before this wave can become `verified`:

- current-head CI must pass;
- Images must pass;
- Blog Showcase Parity must pass;
- UI Browser Acceptance must pass;
- paired Categories desktop/Drawer/mobile and Tags/Comments desktop/mobile artifacts must be downloaded and manually inspected;
- only then may the certification ledger record the reviewed implementation ref and accepted evidence IDs.
