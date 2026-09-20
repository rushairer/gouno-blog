# Blog Admin Core Wave 1 Manual Showcase Parity Review

Status: **verified**

Date: 2026-09-20

Scope:

- Dashboard — `/admin/dashboard`
- Posts — `/admin/posts`
- Pages — `/admin/pages`

Initial certification-rule baseline: `rushairer/gouno-blog@a64dcd1036f74e3146bed7ce79f17ce2c5ac7c75`

Current Product validation baseline: `rushairer/gouno-blog@87800efa1d80a2f698a3d4e279b2825b4361188a`

Canonical reference: `rushairer/gouno-ui@c64c19f1a045545f54d988609a6ad2e80f2dfe6c`

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

## Verified evidence

The accepted evidence set is the current-head validation for `87800efa1d80a2f698a3d4e279b2825b4361188a` against Gouno UI `c64c19f1a045545f54d988609a6ad2e80f2dfe6c`:

- CI run `35488456855` / #1948 — success;
- Images run `35488456865` / #1104 — success;
- Blog Showcase Parity run `35488456854` / #414 — success;
- UI Browser Acceptance run `35488456853` / #498 — success;
- paired parity artifact `10598047486`, SHA-256 `92e8bf79a65317cf07077f300356f23ee1a8222552ab0d110325a06a94dbe720`;
- rendered acceptance artifact `10597529814`, SHA-256 `3ebfd10be2104d2996717f4ec8224d9539b027b31f1434d5a154235fc128a45c`.

### Manual paired-screenshot review

The accepted #414 artifact was downloaded and inspected directly rather than treating artifact creation as proof by itself. The review covered:

- Dashboard light + dark;
- Posts desktop light + dark;
- Posts mobile light + dark;
- Posts destructive Modal light + dark;
- Pages desktop light + dark.

After the locale-harness correction, no unexplained composition, spacing, typography, action-grammar or responsive drift remained in these reviewed views. Differences in analytics values, dates, row counts, fixture copy and real Product data are intentional data/business differences.

The preceding parity run #413 is explicitly **not** accepted as certification evidence. Its geometry checks passed, but manual artifact review exposed the Product running under the CI browser's en-US locale while the canonical Fixture rendered zh-CN, causing `Please select` versus `请选择`. The harness was corrected, the visible Select copy was added to parity assertions, and only the successful rerun #414 is accepted.

This wave is therefore certified under the manual-first protocol. The aggregate `blog-admin-core-support` family remains `needs-manual-recertification` until the remaining non-AI Admin waves complete.
