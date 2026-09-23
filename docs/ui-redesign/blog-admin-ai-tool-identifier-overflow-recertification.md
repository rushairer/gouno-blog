# Blog Admin AI Tool Identifier Overflow Recertification

Status: **pending manual recertification**

Date: 2026-09-23

## Scope

This focused review renews the `blog-admin-ai` certification after a real Blog Admin Skill editor exposed a long monospace Tool identifier overflowing its two-column authorization card.

Reported production-style identifier:

- `analytics.list_low_engagement_posts`

The fix is intentionally narrow. It does not reopen the wider AI Settings migration or alter business behavior.

## Canonical owner

Gouno UI now owns the overflow rule on `main` at:

- merge ref `cb629669cf94ec2edced6543dfdafc7444f84c6d`;
- `showcase/demos/products/blog-admin/ai/settings/editors.tsx`;
- `showcase/demos/products/blog-admin/ai/settings/fixtures.ts`.

Canonical behavior:

- the Tool card and text column are shrinkable with `min-w-0`;
- the text column owns remaining width with `flex-1`;
- monospace Tool identifiers use `overflow-wrap:anywhere`;
- identifiers remain fully readable rather than being truncated;
- stress fixtures include `analytics.list_low_engagement_posts` and `content.propose_distribution_draft`;
- browser geometry asserts both the identifier and its card remain free of horizontal overflow.

## Product containment

Blog Product source was fixed and merged first at `03d5083d4a19aa69a25b4d39293d724b9e878eba`.

The Product uses the same containment contract in `SkillForm.tsx`. Its browser fixture now carries the reported long identifier and UI Browser Acceptance directly checks computed `overflow-wrap`, Tool-card geometry and document-level horizontal overflow.

## Evidence status

Fresh evidence against the merged Canonical ref is being collected on this recertification PR. The machine-readable certification remains `needs-manual-recertification` until those exact runs and retained artifacts are reviewed and recorded.

No Agent/Skill API, capability semantics, Tool risk policy, approval rule, execution mode, permissions or persistence behavior changes in this fix.
