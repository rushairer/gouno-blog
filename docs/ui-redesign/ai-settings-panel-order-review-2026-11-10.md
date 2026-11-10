# AI settings panel order review, 2026-11-10

Status: AI-assisted rendered findings and regression evidence; **not maintainer certification**. The blog-admin-ai ledger remains needs-manual-recertification.

Before source: Blog main1bbd102548d601bed3f6dd62784a8ae81e9fe02e. Canonical component/fixture tree matches UI d171541; the paired runner uses security-fixed UI7c198004 (merged as ad29789e), which changes only the development lock and documentation. Product keeps exact @gouno/ui0.4.9 and @gosso/client0.9.3.

Browser plugin/skill unavailable: actual native repository Playwright Chromium used. Product http://127.0.0.1:4173/admin/ai-settings and Canonical http://127.0.0.1:4174/?embedded=1&workspace=blog-admin&brand=blog-admin#blog-admin-ai-settings. Existing static API fixtures and synthetic recent-MFA presentation were used; this is not real OIDC, Staging or server authorization evidence.

## Actual findings and repair

PI-02 requires Tabs → panel context/actions → whole-panel feedback → content. Direct paired desktop/mobile light/dark review found Product API Access, model connections and knowledge feedback above the lead, contrary to Canonical. Fix Product composition: expose its lead before the existing SudoGate; disable all sensitive lead actions while locked. API Access keeps reads gated and clears sensitive state on lock; its content and dialogs remain conditional on active recent MFA. No shared auth hook, server policy, public component API, Connector behavior or Canonical visual baseline is changed.

Meaningful Playwright regressions exercise actual Product/Showcase: unlocked leads precede security feedback with actions enabled; locked API Access shows the disabled lead, exposes no client record and makes no sensitive management request; locked model/knowledge leads show three disabled actions. Both themes are covered. Existing full parity continues to exercise Provider editors, API Client states and the sibling settings sections. No tests or thresholds are removed.

The initial AI Operations comparison intentionally uses different static Run sets; it does not establish equivalent Run state semantics. Brand/navigation/localized copy, fixture counts, default model selections and the Showcase framing remain intentional fixture/product differences. They are not reasons to copy synthetic capabilities or records into Product.

Local validation on Node24.18.0: full frontend quality passes, including392 tests in67 files; overall coverage64.13%, the existing coverage ratchets, CSS/UI contracts, typecheck, build/chunk budget and lint61/61 warnings with0errors. Seven targeted paired Chromium regressions pass. After-fix captures cover three sections at1440x1000 and390x844 in light/dark; desktop light and mobile dark pairs were directly inspected, with all browser cases retaining original PNGs.

## Local tooling qualification

Oxlint1.90.0 auto-selects an agent output format in this environment and omits its summary; the existing ratchet correctly rejected that output. Explicit --format default restores deterministic summary verification in both agent and CI environments. Counts still pass through the unchanged fail-closed parser and 61-warning ceiling, with its false-green regression suite. Missing/duplicate summaries, errors and excess warnings still fail.

Unedited PNGs, paired interaction results and local quality logs are retained outside Git in workspace docs/quality/final-evidence-2026-11/continuation-2026-11-10. Initial evidence is preserved separately from after-api-lead and sibling-after. Hash inventory accompanies the evidence. Review exact PR checks before merging or accepting a final main SHA.

This review covers the stated panel-order defect only. It does not certify the full AI corpus, full accessibility, every state, a real database upgrade, restore/rollback or operational readiness. Maintainer certification and authorized Staging remain required. No v1.6.0 Tag/image/publication is asserted.
