# Public Blog + Account Frozen Canonical Recertification

Status: **candidate / awaiting fresh rendered evidence and manual review**

Date: 2026-09-22

## Purpose

This review renews the manual-first Showcase parity certification for `blog-public-account` after Gouno UI completed CSA-5 and froze `canonical-showcase.json`.

The 2026-09-16 Public/Account hardening remains useful historical engineering evidence, but it cannot renew certification:

- its accepted package baseline was `@gouno/ui@0.4.1`;
- the current Blog consumes exact `@gouno/ui@0.4.8`;
- the frozen Gouno UI baseline is the CSA-5 main lineage beginning at merge `059bc2806689f70be7178c16fc50a339f6526405`;
- Home, article index/detail, discovery, document, account, PublicShell, public-content and article-community canonical source blobs changed after the historical review.

No historical green run is therefore treated as current certification evidence.

## Candidate baselines

- Blog starting main: `9caaa9a48e3d0d48c71c37fdf4019e10f0803901`.
- Gouno UI frozen main at review start: `059bc2806689f70be7178c16fc50a339f6526405`.
- Package baseline: exact `@gouno/ui@0.4.8`.
- Frozen matrix authority: `rushairer/gouno-ui/canonical-showcase.json`.

## Frozen Product scope

The direct paired parity harness covers all 12 frozen Public Blog Product Showcase pages:

1. Home
2. Articles
3. Search
4. Article Detail
5. Categories
6. Tags
7. Archive
8. About
9. Custom Page
10. Account Notifications
11. Account Settings
12. Not Found

Product-only category/tag detail routes remain part of the shared Article Index route family and are validated by the Product browser matrix/interactions rather than being invented as additional frozen Showcase pages.

## Required fresh evidence

Before promotion to `verified`, this candidate must produce and pass on the same candidate head:

- Blog CI;
- Blog Showcase Parity against current frozen Gouno UI main;
- UI Browser Acceptance;
- Images where triggered by repository policy.

Manual review must inspect the new paired/rendered artifacts rather than infer acceptance from workflow conclusions.

The Product browser suite retains the full 14-route × 4-viewport × light/dark matrix (112 rendered cases) and 15 focused Public/Account interactions. This candidate additionally retains passing screenshots for the highest-risk certification states:

- Article Detail at phone width;
- Account Notifications mutation failure with loaded data preserved;
- Account Notifications mark-all completion;
- Account Settings identity/security handoff ownership;
- Not Found recovery composition at phone width.

## Review dimensions

The human pass must check, as applicable:

- public reading/discovery hierarchy rather than Admin-shell composition;
- typography and wrapping;
- spacing/rhythm and content width;
- PublicShell/header/main/footer ownership;
- article/document reading geometry and responsive containment;
- loading/error/empty/mutation feedback ownership;
- Account Notifications success/failure state preservation;
- Account Settings GOSSO identity-security ownership boundary;
- recovery navigation;
- light/dark and mobile/desktop consistency;
- intentional Product-only behavior without fabricated Showcase parity.

## Promotion rule

Do not change `docs/ui-redesign/showcase-parity-certifications.json` to `verified` until the fresh artifacts are inspected directly and no unresolved Product or canonical defect remains.

If the review finds a canonical defect, stop Consumer propagation and fix/reopen the canonical owner first. If it finds a Product-only parity defect, fix the Product and rerun this same certification path.
