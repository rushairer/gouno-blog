# Blog Admin AI Tool Identifier Overflow Recertification

Status: **verified / manual-reviewed**

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

## Fresh evidence

The exact recertification candidate passed:

- CI `35805670431` — success;
- Images `35805670340` — success;
- Blog Showcase Parity `35805670349` — success;
- UI Browser Acceptance `35805670320` — success.

Retained artifacts:

- `10727563662` — `blog-showcase-parity-35805670349`, SHA-256 `a08c5e76e4b9cb7dc8a237cf70e221ecd5aa9383429add8fe551b336aa19fc2a`;
- `10728041551` — `blog-browser-acceptance-35805670320`, SHA-256 `6fcb651c126683f63b501a0c64fe67df1e58035388f35a505ca841397e09543d`.

## Manual rendered review

The retained Product screenshot `u04a-skill-long-tool-identifier.png` was inspected directly.

The real `analytics.list_low_engagement_posts` identifier now wraps onto two lines inside its own Tool authorization card. It remains fully readable, does not intrude into the adjacent grid column, does not clip the checkbox/risk pill, and does not create document-level horizontal overflow. The surrounding Dedicated Editor two-column composition remains aligned.

This confirms the intended contract: long technical identifiers wrap only when necessary; they are not truncated and the card remains the layout boundary.

## Conclusion

`blog-admin-ai` is renewed as **verified / manual-reviewed** against:

- Product baseline `03d5083d4a19aa69a25b4d39293d724b9e878eba`;
- Gouno UI Canonical baseline `cb629669cf94ec2edced6543dfdafc7444f84c6d`;
- exact package baseline `@gouno/ui@0.4.9`.

No Agent/Skill API, capability semantics, Tool risk policy, approval rule, execution mode, permissions or persistence behavior changes in this fix.
