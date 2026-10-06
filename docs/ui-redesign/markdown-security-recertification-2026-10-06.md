# Markdown security hardening parity recertification — 2026-10-06

Status: **needs-manual-recertification**

## Scope

This review covers the security-only change to `blog-frontend/src/components/MarkdownRenderer.tsx` at Blog commit `8a2310add7e69b108b68f823145fbafd942b4c37`.

The change rejects unsafe Markdown URL schemes such as `javascript:`, `data:`, and `blob:` for rendered links and images. It does not intentionally change the canonical Blog/Public or Blog Admin editor composition, typography, spacing, feedback, responsive behavior, or Connector product behavior.

Affected certification owners:

- `blog-public-account`
- `blog-admin-core-wave3`

## Manual-first review plan

The certification remains intentionally non-verified until all of the following are captured on the recertification PR:

1. current Blog Product browser acceptance on the exact hardened Product source;
2. current Gouno UI Showcase parity rendered comparison;
3. source review confirming the Markdown security transform does not alter canonical composition;
4. fresh workflow and artifact identifiers recorded in the certification ledger.

The current exact Product HEAD `8a2310add7e69b108b68f823145fbafd942b4c37` already has successful full Blog rendered browser acceptance; the fresh cross-Showcase evidence will be collected from this recertification PR before the status is returned to `verified`.
