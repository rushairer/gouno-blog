# Blog Admin Core Wave 2 Manual Showcase Parity Review

Status: **needs-manual-recertification; previous verified evidence retained as history**

Date: 2026-09-20

Scope:

- Categories — `/admin/categories`
- Tags — `/admin/tags`
- Comments — `/admin/comments`

Reviewed Product implementation: `rushairer/gouno-blog@979902532d309cf4da4c35fffe85fcd6c5c71989`

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


## 2026-09-21 recertification — selected-resource action grammar

Status: **verified again after fresh paired manual review**

The invalidated Wave 2 slice has been re-certified against the actually landed canonical change:

- canonical Gouno UI PR: `rushairer/gouno-ui#123`;
- canonical reviewed ref: `8d5c9e605ceee37303e551d71de87bdfec876b2e`;
- Product implementation ref: `d93c12a0309c9d037ee6506770200b30303c2068`;
- `@gouno/ui` package version remains `0.4.8`; this recertification is about canonical Product composition/action grammar, not a package API release.

### What the manual review actually found

The original defect was broader than a single icon:

1. the same selected-resource `交给 AI` action used both `Bot` and `Sparkles` across sibling Collection pages;
2. Categories already differed between Showcase and Product;
3. after the first icon-only paired pass, direct screenshot inspection found a second Product drift: Comments replaced the canonical selection cancel action `取消` with page-local `清除选择`.

The first implementation evidence at Product head `5d931f849cfd14eeb9906888b3536dd43d04be55` was therefore **rejected for certification** even though the paired parity run passed. Its paired artifact `10608537054` remains useful defect-discovery evidence, but is not accepted as the final certification artifact.

The Product was corrected again:

- Tags and Comments use `Sparkles` for `交给 AI`;
- Comments removed its page-local `cancelLabel` override and returned to the canonical default `取消`;
- the Product action-grammar guard now checks all six resource Collections and rejects both `Bot` for the handoff action and page-local `cancelLabel` overrides;
- the paired browser harness now enters the actual selected state for Categories, Tags and Comments, asserts a `lucide-sparkles` icon on both sides, asserts the canonical `取消` action on both sides, compares button styles and captures paired screenshots.

### Final accepted rendered evidence

Exact-head evidence for Product implementation `d93c12a0309c9d037ee6506770200b30303c2068`:

- CI run `35522836690` — success;
- Images run `35522836698` — success;
- Blog Showcase Parity run `35522836688` — success;
- UI Browser Acceptance run `35522836678` — success;
- paired parity artifact `10608943106` (`sha256:70b6cc1eec8b28764267bc7492656ed88204be21d9bec642217fb7b6a655e6f1`);
- browser acceptance artifact `10608758622` (`sha256:050f8ef49c1ececa08413413e03b7380c81e899dd19344fb65ee85d3cbc712f8`).

The final paired selection-state screenshots were directly inspected:

- Categories: Showcase and Product both render the selected Collection action bar with `Sparkles`, destructive `删除`, and canonical `取消`;
- Tags: the same three action semantics and hierarchy align;
- Comments: Product now matches Showcase with `Sparkles` and `取消`; the previously observed `清除选择` drift is gone.

Fixture/Product cardinality still differs, so Product may show the header checkbox as selected when its single fixture row is selected while Showcase retains multiple rows. That is expected data variance and does not change the reviewed action grammar or composition.

The current browser acceptance matrix also passed across the support Admin surfaces after these changes. No Foundation or generic `BulkActionBar` API change was required: the defect belonged to Blog Admin Product composition/action grammar.

Wave 2 is therefore restored to `verified`. Future changes to Categories / Tags / Comments canonical or Product-owned paths must invalidate and manually re-certify this entry again.
