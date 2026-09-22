# Blog Admin Core Wave 3 Frozen Canonical Recertification

Status: **candidate / awaiting fresh rendered evidence and manual review**

Date: 2026-09-22

## Scope

Wave 3 closes the six Blog Admin Product pages not already owned by the verified AI, Wave 1 or Wave 2 certifications:

1. Post Editor
2. Page Editor
3. Notifications
4. Media Library
5. Site Settings
6. Users

The legacy `blog-admin-core-support` umbrella remains historical hardening evidence during this candidate phase. It will not be promoted as a second overlapping verified certification. After Wave 3 passes manual-first review, that umbrella becomes `legacy-hardening-complete` and the six pages become owned by the new precise `blog-admin-core-wave3` entry.

## Baselines

- Blog starting main: `c98ab56e9c0452b69674a6f052724dc1621cadb2`.
- Gouno UI frozen main: `059bc2806689f70be7178c16fc50a339f6526405`.
- Exact package baseline: `@gouno/ui@0.4.8`.
- Browser plugin: not available in this session; repository Playwright/GitHub Actions is the validation path.

Both the historical canonical and Product implementations changed after the 2026-09-15 hardening pass, so old artifacts are not used as current certification evidence.

## Manual preflight findings

Before accepting browser evidence, source-by-source manual review found two Product-only typography drifts that were not safe to waive:

- Post Editor revision-conflict content used raw `font-semibold` / `text-sm` instead of semantic typography roles.
- Media Library blocked-reference links used raw `font-medium` while the frozen Showcase uses `type-weight-medium`.
- Users role-description text used a raw `leading-relaxed` utility even though Core `Text` owns the semantic `leading="relaxed"` API.

The candidate fixes all three and extends `check-admin-parity-contracts.mjs` so these reviewed drifts cannot silently return. Page Editor's Inspector summary `text-sm font-semibold` is intentionally unchanged because it is identical to the frozen Showcase source; changing only the Consumer would create a new parity drift.

## Fresh evidence required

The same candidate head must pass:

- CI;
- Images where repository policy triggers it;
- Blog Showcase Parity against current frozen Gouno UI;
- UI Browser Acceptance.

The human review must inspect the new artifacts directly.

Existing paired parity covers the six frozen pages, and this candidate strengthens the states that were previously only Product-side evidence: Notifications selection/BulkActionBar, Media selected-resource AI handoff (including Sparkles semantics), and the Users edit-permissions Modal.

The paired coverage includes:

- Post Editor and Page Editor canonical editor shells across light/dark and responsive viewport contracts;
- Notifications filter/object Card in light/dark;
- Media asset Card in light/dark;
- Site Settings tab lead/surface in light/dark with elevated access;
- Users directory/table typography in light/dark with elevated access.

Existing Product browser interactions already exercise Post/Page editor AI/content/save workflows, revision conflict, read-only ownership, Media selection, Site Settings failure/retry and Users modal. This candidate adds the missing Notifications selection/BulkActionBar interaction and retains passing screenshots for the highest-risk Wave 3 states.

## Retained high-risk screenshots

- Post Editor revision conflict at 768px with unsaved draft preserved;
- Page Editor at 390px dark after real AI metadata/save flow;
- Notifications selected-resource BulkActionBar at 390px dark;
- Media Library selected asset at 390px dark;
- Site Settings fatal load error and successful retry;
- Users edit-permissions Modal.

## Review dimensions

Manual review must cover:

- composition and page hierarchy;
- typography;
- spacing/rhythm;
- feedback/error ownership;
- interaction state;
- responsive containment;
- editor vs collection workspace ownership;
- high-privilege boundary presentation;
- light/dark consistency;
- intentional Product data/API differences.

No certification status changes in this candidate commit. Promotion to `verified` occurs only after fresh exact-head artifacts are green and manually inspected.
