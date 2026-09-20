# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **verified; paired browser evidence manually accepted**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Reviewed Product implementation: `rushairer/gouno-blog@11a20e8068e9b56aeeb24d4d7b01e6d253499d64`

Canonical reference: `rushairer/gouno-ui@8d5c9e605ceee37303e551d71de87bdfec876b2e`

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

## Accepted evidence

The current implementation evidence was completed and manually reviewed on 2026-09-20:

- CI run `35495441658` — success;
- Images run `35495441659` — success;
- Blog Showcase Parity run `35495441667` — success;
- UI Browser Acceptance run `35495441666` — success;
- paired parity artifact `10600359041` (`sha256:0c10da0e8c2e513743e6b0571c00ea0db14e13fa1688c7254251575cf717e73a`);
- browser acceptance artifact `10600920008` (`sha256:1119a522b24a9d5bbbd10a3b408200a40bcf4658f10f27dce797f80d58bf27d4`).

The paired screenshots were inspected directly rather than inferred from green tests. The review covered Categories light/dark desktop, Categories Drawer light/dark, Categories 390px mobile, Tags light/dark desktop and 390px mobile, and Comments light/dark desktop and 390px mobile.

The inspected evidence preserves the same page hierarchy, semantic typography, spacing rhythm, card/table geometry, action hierarchy, Drawer anatomy and responsive composition between Showcase and Product. Differences in fixture cardinality, concrete copy/data, timestamps, counts and Product shell chrome are expected Product-owned differences and were not treated as parity failures.

Wave 2 is therefore `verified` in the manual-first certification ledger.


## 2026-09-20 invalidation — selected-resource AI handoff icon grammar

The previous Wave 2 certification is intentionally no longer current.

A manual cross-page review found that the same selected-resource `交给 AI` action used two icon semantics:

- canonical Showcase: Categories / Tags / Comments used `Bot`, while sibling Posts / Pages / Media used `Sparkles`;
- real Blog Admin: Tags / Comments used `Bot`, while Categories / Posts / Pages / Media used `Sparkles`.

This is neither data-only variance nor a legitimate Product divergence. The action meaning is the same: hand selected resources to the AI Workflow launcher. The canonical action grammar now reserves `Sparkles` for AI assistance/generation/handoff actions and `Bot` for Agent/AI entity identity or status.

Product Tags and Comments are synchronized to `Sparkles`, and the existing action-grammar CI guard now checks all six sibling resource Collections.

The old browser evidence remains useful history, but it cannot certify the changed action grammar. This document and the ledger therefore remain `needs-manual-recertification` until:

1. the paired canonical Gouno UI change lands;
2. current Product and canonical refs are compared again;
3. paired browser evidence is generated and directly inspected;
4. the ledger is refreshed last with the new refs and artifacts.


## 2026-09-20 recertification — selected-resource AI handoff icon grammar

The invalidation above is now resolved.

The canonical Gouno UI action grammar landed in `rushairer/gouno-ui#123` and defines:

- `Sparkles` for AI assistance/generation and selected-resource handoff to an AI Workflow;
- `Bot` for Agent/AI entity identity or status.

The Product candidate synchronizes Tags and Comments to the canonical `Sparkles` action icon. Categories, Posts, Pages and Media already used `Sparkles`.

A durable Product-side action-grammar guard now checks all six resource Collections:

- Posts;
- Pages;
- Categories;
- Tags;
- Comments;
- MediaLibrary.

The paired browser harness was also expanded specifically for the state that exposed the defect. For Categories, Tags and Comments, in both light and dark themes, the test now:

1. selects one real fixture item;
2. verifies the `BulkActionBar` appears on Showcase and Product;
3. verifies the `交给 AI` action exists on both sides;
4. requires `svg.lucide-sparkles` and forbids `svg.lucide-bot`;
5. compares the toolbar and AI-button computed styles;
6. saves paired selection-state screenshots.

### Fresh exact-head evidence

Implementation head: `11a20e8068e9b56aeeb24d4d7b01e6d253499d64`  
Canonical ref: `8d5c9e605ceee37303e551d71de87bdfec876b2e`

- CI run `35512041686` — success;
- Images run `35512041681` — success;
- Blog Showcase Parity run `35512041687` — success;
- UI Browser Acceptance run `35512041688` — success;
- paired parity artifact `10604968458`, SHA-256 `52904fb18e92f76e7a30f89d698cd739f3b06d26d167a2313c06f4309d732284`;
- browser acceptance artifact `10605163959`, SHA-256 `eace78ebac207b55665c64a8fb751c6493a203428a75561e3205059c101ffbed`.

### Direct manual screenshot review

The newly added selection-bulk pairs were inspected directly rather than inferred from green automation.

Accepted states:

- Categories light/dark — Product and Showcase both show `Sparkles → 交给 AI → 删除 → 取消`; BulkActionBar height, action density and selected-row relationship remain aligned;
- Tags light/dark — Product and Showcase both show the same `Sparkles → 交给 AI` action grammar; differing card counts are fixture data variance only;
- Comments light/dark — Product and Showcase preserve the same filter → selection bar → moderation-card hierarchy, with `Sparkles` on the AI handoff and consistent destructive/cancel ordering.

No additional layout, spacing, typography or interaction defect was found in this recertification pass.

`OperationsWorkspace` was deliberately not changed by this correction. Current source inspection found no runtime import from `AIOperations.tsx` or another live Product module; it is therefore not part of the current List-surface recertification, and changing it here would unnecessarily reopen the separately certified Blog Admin AI scope.

Wave 2 is again `verified`.
