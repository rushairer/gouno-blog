# Markdown security hardening parity recertification — 2026-10-06

Status: **needs-manual-recertification**

## Scope

This review covers the security-only change to `blog-frontend/src/components/MarkdownRenderer.tsx` at Blog commit `8a2310add7e69b108b68f823145fbafd942b4c37`.

The change rejects unsafe Markdown URL schemes such as `javascript:`, `data:`, and `blob:` for rendered links and images. It does not intentionally change the canonical Blog/Public or Blog Admin editor composition, typography, spacing, feedback, responsive behavior, or Connector product behavior.

Affected certification owners:

- `blog-public-account`
- `blog-admin-core-wave3`

## Manual source review

The previously certified Public Blog source (`bea9ea122c5e82877149ac0983f639660f27ae42`) and Blog Admin Wave 3 source (`57c3249d14e15e8eb71a3dbc18bced516cda1e14`) have been compared with `8a2310add7e69b108b68f823145fbafd942b4c37`.

The Markdown renderer's canonical presentation is unchanged:

- heading levels, semantic Gouno UI variants and spacing are unchanged;
- paragraph, list, blockquote, table, code-block and image classes are unchanged;
- external-link target/rel behavior is unchanged;
- the only Product rendering change is an explicit `react-markdown` `urlTransform` safety boundary that removes unsafe URL schemes.

This review therefore finds no intentional Showcase composition or visual-language change.

## Exact Product browser evidence

The exact hardened Product HEAD `8a2310add7e69b108b68f823145fbafd942b4c37` completed **UI Browser Acceptance** successfully:

- workflow run: `37471084862`
- artifact: `blog-browser-acceptance-37471084862`
- artifact id: `11416809057`
- artifact SHA-256: `081dc94dc13f560fe9e7a12d4273e3289ca5c1a941e69c12fc228705d64426f8`

## Remaining recertification evidence

The certification intentionally remains non-verified until the recertification PR captures fresh current-Gouno-UI Showcase parity rendered comparison. Once that run passes, its workflow/artifact identifiers must be recorded in the certification ledger and this document can move to **verified**.

No certification status is being bypassed merely to make CI green.
