# AI Settings / Skill Tool Bindings — JSON 编辑与提交契约增量审查

Status: **needs-manual-recertification**

## 影响范围与基线

- Source base: `rushairer/gouno-blog` main `71835ea1f03bbd0c376aa63154095e65eb202933` (#383 accepted).
- Canonical: `rushairer/gouno-ui` Showcase AI Settings / Skills Dedicated Editor; no canonical edits, no @gouno/ui version changes.
- Product: `SkillForm.tsx`, `ToolBindingsEditor.tsx` and real-page/browser/unit assertions only. No AI backend/Tool authorization/API/schema/billing/Connector mutation change.
- This is a **targeted JSON validation and submit-guard review**, not an entire AI-family manual recertification.

## Confirmed source-level defect

The prior Tool Bindings test named "updates on valid JSON input" only opened JSON mode and asserted initial text. `ToolBindingsEditor` preserved invalid raw JSON in a local text draft and showed an error, but `SkillForm.submit` always serialized the last accepted `value.tool_bindings` when the user saved. As a result, an operator could press Save with an invalid visible JSON draft and unknowingly save the previous valid bindings. The previous parser also accepted nested `null`, scalar or array values as though they conformed to `Record<string, Record<string, unknown>>`.

## Bounded corrective contract

- A valid top-level JSON object whose Tool values are JSON objects is applied through the existing controlled `onChange` path; visual and JSON modes round-trip the same accepted configuration.
- Invalid syntax, non-object roots and non-object Tool bindings must **not** emit a configuration change. Show the existing in-field validation feedback and disable the parent Save action until corrected.
- Switching back to Visual Form explicitly discards the unapplied invalid JSON draft, displays the last accepted binding values and re-enables Save.
- No secondary copy of accepted Tool bindings, no auto-save on invalid input, no mutation replay or new backend validation bypass. Existing defaults for newly checked tools stay intact.

## Evidence required before verified

- Confirm actual controlled-component tests for JSON -> visual -> JSON, bad syntax, nested null, disabled save, and corrected/saveable JSON; do not count the previous misleading toggle-only test.
- Run exact PR head CI, Images, Browser Acceptance and Showcase Parity, with no skipped/flaky cases or relaxed thresholds.
- Manually inspect the actual Product desktop/mobile invalid and recovered states in fresh browser screenshots, then compare affected canonical Skill editor structure and baseline visual parity. Record any intentional divergence.
- Review final compiled JS/CSS and security/authorization impact; Product invalid-state disabled button is a local validation affordance, not a canonical component redesign.
- Only then update the sole certification ledger entry `blog-admin-ai`, record exact reviewed refs, final run IDs and verified artifact hashes, and change this document's status to **verified**.

Do not confuse the preceding #383 accepted parity report with current JSON-edit evidence. The current certification is intentionally pending.
