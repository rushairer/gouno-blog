# @gouno/ui 0.4.9 Blog Consumer Recertification

Status: **verified / manual-reviewed**

Date: 2026-09-22

## Scope

This review renews the five active manual-first Blog certifications after the exact registry dependency moved from `@gouno/ui@0.4.8` to `@gouno/ui@0.4.9`:

- Blog Admin AI Settings + AI Operations;
- Blog Admin Core Wave 1: Dashboard + Posts + Pages;
- Blog Admin Core Wave 2: Categories + Tags + Comments;
- Blog Admin Core Wave 3: Post Editor + Page Editor + Notifications + Media Library + Site Settings + Users;
- Public Blog + Blog Account.

The earlier per-family manual review documents remain the detailed source for each family's composition, state coverage and intentional Product divergences. This document is the package-baseline renewal evidence shared by all five families.

## Accepted baselines

- Blog candidate reviewed with 0.4.9: `bea9ea122c5e82877149ac0983f639660f27ae42`.
- Gouno UI release source: `4495147ae0b9807d2e5c9137187cfdc3e906cceb`.
- Exact package baseline: `@gouno/ui@0.4.9`.
- Release tag: `v0.4.9`.
- Frozen Product authority remains `rushairer/gouno-ui/canonical-showcase.json`.

The package upgrade does not reopen the frozen Product migration program. It renews the exact dependency baseline against the already-certified Product ownership.

## Runtime-diff audit

The `v0.4.8...v0.4.9` runtime diff is limited to Core Cascader, Image preview toolbar stacking, shared picker trigger internals, Select, Steps and TreeSelect.

Consumer usage was checked before accepting browser evidence:

- Blog does not consume Core TreeSelect or Cascader in the certified Product routes.
- Blog does not render Core Steps in the certified Product routes.
- Blog Admin uses Core Select extensively, but the certified code uses single-value Select; no `mode="multiple"` consumer exists.
- The 0.4.9 multi-value chevron fix therefore exercises shared picker internals without changing Blog's intended single-value Select grammar.
- The Core Image preview toolbar change is not consumed by the reviewed Blog surfaces as a Core Image preview interaction.

## Fresh 0.4.9 evidence

The exact Blog candidate passed:

- Blog Showcase Parity `35721612018` — success;
- UI Browser Acceptance `35721612060` — success;
- CI `35721612086` — success;
- Images `35721611974` — success.

Fresh retained artifacts:

- `10692410965` — `blog-showcase-parity-35721612018`, SHA-256 `ee2e73a1df99eb70eaa98a994d237961a14040c846787d20969b95f02413d012`;
- `10691856972` — `blog-browser-acceptance-35721612060`, SHA-256 `d6296f9eb13d3092c8d93d9d873ef3b0e1bbc0715dfeb9afb73da2a028f2ba71`.

## Manual rendered review

Green workflows were treated as supporting evidence, not as visual proof.

The fresh 0.4.9 Product captures were inspected directly. The high-risk Blog Admin member-edit Modal preserves the visible FormField/Select relationship, full trigger width, trailing chevron alignment, focus ownership and Modal boundary. The Media Library toolbar preserves its search/filter geometry and the media-type Select keeps the same trailing chevron and control alignment at desktop width.

The AI Settings retained evidence was also inspected to confirm that the package upgrade did not disturb the dedicated editor/drawer layering or surrounding canonical layout. No new overlay, width, focus, spacing or trailing-icon drift was observed.

The full fresh browser/parity runs continue to cover the already-certified responsive, dark-mode, feedback, editor, drawer/modal and collection states. Public Blog remains unaffected by the changed picker surfaces and stayed green in the same exact candidate.

## Conclusion

All five active Blog certifications are renewed as **verified / manual-reviewed** on `@gouno/ui@0.4.9`.

This is a dependency-baseline renewal only. Real APIs, permissions, autosave/conflict behavior, AI workflows, media behavior, public-site data and the previously recorded intentional Product divergences remain Product-owned and unchanged.

Any later `@gouno/ui` version change, certified Product-owned path change or certified canonical-path change invalidates the corresponding certification again until fresh manual-first evidence is recorded.
