# Markdown security hardening parity recertification — 2026-10-06

Status: **verified**

## Scope

This review covers the security-only change to `blog-frontend/src/components/MarkdownRenderer.tsx` introduced at Blog commit `8a2310add7e69b108b68f823145fbafd942b4c37`.

The change rejects unsafe Markdown URL schemes such as `javascript:`, `data:`, and `blob:` for rendered links and images. It does not change the canonical Blog/Public or Blog Admin editor composition, typography, spacing, feedback, responsive behavior, or Connector product behavior.

Affected certification owners:

- `blog-public-account`
- `blog-admin-core-wave3`

## Manual source review

The previously certified Public Blog source (`bea9ea122c5e82877149ac0983f639660f27ae42`) and Blog Admin Wave 3 source (`57c3249d14e15e8eb71a3dbc18bced516cda1e14`) were compared with the hardened source.

The Markdown renderer's canonical presentation is unchanged:

- heading levels, semantic Gouno UI variants and spacing are unchanged;
- paragraph, list, blockquote, table, code-block and image classes are unchanged;
- external-link target/rel behavior is unchanged;
- the only Product rendering change is an explicit `react-markdown` `urlTransform` safety boundary that removes unsafe URL schemes.

The review therefore finds no Showcase composition or visual-language drift.

## Fresh recertification evidence

Reviewed Blog source ref: `01278d5046dfd74bcf78d9c35832141beb010675`.

Reviewed Gouno UI main ref: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`.

Successful runs:

- Blog Showcase Parity: `37481262324`
- UI Browser Acceptance: `37481262325`
- CI: `37481262300`
- Images: `37481262167`
- Gosso Release BFF Compatibility: `37481262153`

Retained evidence:

- `blog-showcase-parity-37481262324`, artifact `11422440290`, SHA-256 `3b1f85efa588f36b32758bce8937e13b3471411bf5b804b01c7db87feb4bf900`
- `blog-browser-acceptance-37481262325`, artifact `11422060992`, SHA-256 `5b62655704fbea7d6dcb5cc643f7ae8c7a03b1bb33e6b3edb755344770081a60`

## Decision

Both `blog-public-account` and `blog-admin-core-wave3` are re-certified as **verified**.

The security hardening remains in place. No visual exception, certification bypass, Connector behavior change, BFF/session/OIDC relaxation, or non-canonical `@gouno/ui` dependency was introduced to obtain this result.
