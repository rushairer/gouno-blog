# Blog Admin Core Wave 1 Manual Showcase Parity Review

Status: **implementation review complete; paired browser evidence pending**

Date: 2026-09-20

Scope:

- Dashboard — `/admin/dashboard`
- Posts — `/admin/posts`
- Pages — `/admin/pages`

Certification-rule baseline: `rushairer/gouno-blog@a64dcd1036f74e3146bed7ce79f17ce2c5ac7c75`

Canonical reference: `rushairer/gouno-ui@a752c16e5f3f2d85215a04ea9ef7d33c56b733ee`

Product baseline before this review: `rushairer/gouno-blog@9484fc80fceeee7bbdc3cce920c9a575ecde453e`

This is the first non-AI recertification wave under `SHOWCASE_PARITY_PROTOCOL.md`. Historical parity hardening and green browser suites were treated as background evidence only.

Validation is evaluated against the PR merge result with the current `main`. Concurrent unrelated `main` work is not copied into this wave or reimplemented here; if `main` moves, the wave is revalidated against that newer merge result.

## Manual review method

The current Showcase and real Product source were read side-by-side before changing the Product. The review covered:

- composition and page-stack ownership;
- semantic typography roles;
- spacing/rhythm ownership;
- persistent vs transient feedback ownership;
- row/action grammar;
- desktop/mobile responsive structure.

Existing automated parity failures were not used as the starting point.

## Findings

| Surface | Manual finding | Classification | Decision |
| --- | --- | --- | --- |
| Dashboard summary/cards | Overall composition, card grouping and 24px page rhythm still match the canonical fixture. Product retained raw `text-xs`, `text-xl font-semibold`, arbitrary `text-[10px]` / `text-[11px]` and CardTitle size overrides where Showcase had moved to semantic typography roles. | `ui-drift` | Preserve real analytics/permission data; restore `type-caption`, `type-metric-compact` and canonical CardTitle ownership. |
| Dashboard AI alerts | Product-only routing and real alert data are legitimate, but alert title/meta typography had drifted from the fixture. The object row had also changed from canonical top alignment (`items-start`) to centered alignment with local `mt-0.5` icon compensation and hover translation. | presentation/composition = `ui-drift`; business data = `intentional-product-divergence` | Restore canonical object-row anatomy and semantic typography while retaining real destination and API behavior. |
| Dashboard Top Posts | Card/table/action composition remains aligned. Numeric cells still used raw mono/xs typography in Product. | `ui-drift` | Keep real links and permissions; align semantic caption typography. |
| Posts collection | PageHeader, filter Card, selection, BulkActionBar, table/mobile split, destructive Modal and action grammar remain structurally aligned. Title/meta/slug/date/view typography used raw utilities instead of the canonical semantic roles. The visible root layout matched the Showcase but did not expose the canonical `collection-composition` contract marker. | typography = `ui-drift`; contract observability = `contract-drift` | Align typography and expose the reviewed Collection Composition marker; retain real API/filter/permission/routing behavior. |
| Pages collection | PageHeader, filter Card, selection, table/mobile split, Modal and action grammar remain structurally aligned. Title/summary/slug/date/meta typography used raw utilities instead of semantic roles. The visible root layout matched the Showcase but did not expose the canonical `collection-composition` contract marker. | typography = `ui-drift`; contract observability = `contract-drift` | Align semantic typography and expose the reviewed Collection Composition marker; retain copy/delete/AI launcher and real page metadata behavior. |

## Root cause confirmed

The previous direct Showcase/Product `styleFingerprint` intentionally checked layout, surface, border and geometry but did not inspect typography. Static Admin parity contracts likewise guarded composition, feedback and primitive ownership, but not the semantic typography roles of these collection pages.

That left a blind spot where a Product could continue to pass parity while using raw `text-*` / `font-*` utilities after the canonical Showcase had migrated to `type-*` roles. The collection pages also matched the visible root rhythm without exposing the canonical `collection-composition` marker, so the structure could not be bound to the named composition contract. A first manual review of the paired artifact also exposed a harness defect: normal `openPair()` comparisons inherited the CI browser's en-US locale while the canonical Blog Admin Fixture rendered zh-CN, producing English `Please select` component copy inside an otherwise Chinese Product screenshot. AI parity already pinned zh-CN. The general Blog Admin parity harness now pins the same Product locale before navigation and directly compares the three visible Posts Select values.

## Fixes extracted from the manual review

- Dashboard:
  - AI alert row → canonical `items-start` object-row anatomy; remove page-local icon/hover compensation;
  - summary detail → `type-caption`;
  - governance metrics → `type-metric-compact`;
  - AI alert labels/meta/actions/timestamps → canonical body/caption roles;
  - Top Posts numeric cells → canonical caption role;
  - remove local CardTitle size overrides and arbitrary 10px/11px type.
- Posts:
  - root → `data-pattern="collection-composition"`;
  - title → `type-weight-semibold`;
  - metadata → `type-caption`;
  - slug/date/views → `type-family-mono type-caption`.
- Pages:
  - root → `data-pattern="collection-composition"`;
  - title → `type-body-sm type-weight-semibold`;
  - summary/meta → `type-caption`;
  - slug/date → `type-family-mono type-caption`.

## Durable guard design

The conclusions are being encoded only after manual classification:

1. `check-admin-parity-contracts.mjs` rejects the reviewed raw typography regressions, requires the semantic roles, and locks the Posts/Pages Collection Composition markers.
2. A dedicated `typographyFingerprint` compares computed font/color properties only on this reviewed wave. It is deliberately not folded into the global layout fingerprint yet, so unreviewed surface families are not accidentally certified or blocked by a rule derived without manual review.
3. The general paired harness pins Product locale to zh-CN before navigation and compares visible Posts Select copy, so locale-context mismatch cannot hide behind geometry-only parity.
4. The aggregate non-AI Admin certification remains `needs-manual-recertification`; this wave receives its own certification entry and can be promoted independently after paired browser evidence passes.

## Intentional product divergences retained

- real permission checks and route ownership;
- real API-backed analytics/posts/pages data;
- Product router links instead of Showcase simulated navigation;
- real clipboard/delete/AI workflow behavior;
- dynamic dates, IDs, counts and content.

These differences must not be removed merely to make fixture content literal.

## Pending evidence

Before this wave can be marked `verified`:

- current branch CI must pass;
- Blog Showcase Parity must pass with the new typography comparisons in light and dark themes;
- UI Browser Acceptance and image builds must remain green;
- paired screenshots for Dashboard / Posts / Pages must be reviewed for unexpected composition drift;
- the certification ledger must then be updated with the reviewed implementation ref and evidence IDs.
