# Public Blog + Account Frozen Canonical Recertification

Status: **verified / manual-reviewed**

Date: 2026-09-22

## Purpose

This review renews the manual-first Showcase parity certification for `blog-public-account` after Gouno UI completed CSA-5 and froze `canonical-showcase.json`.

The 2026-09-16 Public/Account hardening remains historical regression evidence only. It was not reused as current certification because it predated the manual-first protocol, used `@gouno/ui@0.4.1`, and the Public Blog canonical/Product paths changed materially afterwards.

## Accepted baselines

- Blog reviewed ref: `0d4e0b1e9dc42cf2a3adc9fae1903e1484287ad5`.
- Gouno UI frozen ref: `059bc2806689f70be7178c16fc50a339f6526405`.
- Package baseline: exact `@gouno/ui@0.4.8`.
- Frozen authority: `rushairer/gouno-ui/canonical-showcase.json`.

The frozen Product scope is all 12 Public Blog Showcase pages: Home, Articles, Search, Article Detail, Categories, Tags, Archive, About, Custom Page, Account Notifications, Account Settings and Not Found.

Product-only category/tag detail routes remain concrete instances of the shared Article Index family; they are covered by Product browser tests and are not invented as additional frozen Showcase ids.

## Fresh exact-candidate evidence

Candidate head `0d4e0b1e9dc42cf2a3adc9fae1903e1484287ad5` passed:

- CI `35626915555` — success;
- Images `35626915593` — success;
- Blog Showcase Parity `35626915579` — success, **80 / 80** total paired parity tests;
- UI Browser Acceptance `35626915548` — success, **340 / 340** total rendered Product tests.

Retained artifacts:

- paired parity `10652708296` — `blog-showcase-parity-35626915579`, SHA-256 `f866fefa7e2da7fc49390ffef7681c52a96dd60863f15d4f6db2294146d02342`;
- Product browser `10652463948` — `blog-browser-acceptance-35626915548`, SHA-256 `2c860766e8becd7a30c7ad276dfb666478001e149bc59b41fb911d0f6c6ffb56`.

Within those full-suite totals, Public/Account coverage contains:

- 12 frozen Showcase pages × light/dark direct pairing = 24 Public paired comparisons;
- 14 Product public/account routes × 4 viewports × light/dark = 112 rendered matrix cases;
- 15 focused Public/Account interaction flows.

## Manual rendered review

The paired artifact was inspected directly rather than accepting the green workflow as visual proof. Light/dark Product ↔ Showcase pairs were reviewed across Home, Articles, Search, Article Detail, Categories, Tags, Archive, About, Custom Page, Account Notifications, Account Settings and Not Found.

No unresolved canonical or Product parity defect was found. Differences in fixture copy, real Product data volume, article/community content and runtime route data are intentional Product ownership, not composition drift.

The Product browser artifact was also inspected directly. In addition to representative 390px/desktop light/dark matrix captures, five passing high-risk states were retained explicitly:

1. **Article Detail mobile** — the long reading surface remains within the 390px document width; TOC, cover, metadata, CodeBlock, related reading, community and comment editor preserve one coherent reading hierarchy without document overflow.
2. **Account Notifications mutation failure** — the transient operation error remains an Alert above the still-usable loaded notification list; unread state is preserved instead of collapsing into fatal page error or Empty.
3. **Account Notifications mark-all completion** — unread count reaches zero, read controls disappear/disable correctly and the loaded history remains visible under the All filter.
4. **Account Settings identity boundary** — the page contains no Blog-local password/MFA/Passkey form and keeps the explicit GOSSO Admin handoff as the single security-management action.
5. **Not Found mobile** — the Result surface, Home/Articles/Search recovery actions, previous-page action, PublicShell and footer remain contained and readable at phone width.

Representative Home/Search/Categories/Custom Page/Account matrix captures were also checked at mobile and desktop, light and dark. No horizontal overflow, misplaced overlay/tooling, duplicate surface ownership or typography/spacing hierarchy defect was observed.

## Review dimensions

The manual pass covers:

- composition;
- typography;
- spacing/rhythm;
- feedback and lifecycle semantics;
- interaction ownership;
- responsive containment;
- light/dark presentation;
- PublicShell/header/main/footer ownership;
- reading/document geometry;
- Account/GOSSO security boundary.

## Intentional Product divergences

The certification explicitly permits:

- real Product data, counts, timestamps and content lengths instead of Showcase fixture values;
- real runtime navigation and API lifecycle;
- category/tag detail routes as Product instances of the shared Article Index family;
- Product community interactions and account session state;
- runtime CMS custom-page slugs/content;
- GOSSO handoff configuration supplied by Product runtime.

These divergences do not authorize recreating canonical visual primitives or Admin-shell grammar in Public routes.

## Certification conclusion

`blog-public-account` is **verified** for the frozen Gouno UI baseline above.

The final certification commit changes only the manual review/ledger, not the reviewed Product-owned paths. Repository CI must still pass on that final head before merge. Any later change under the certified `ownedPaths`, `canonicalPaths` or exact `@gouno/ui` package baseline makes this certification stale under `SHOWCASE_PARITY_PROTOCOL.md` and requires a new manual-first review.
