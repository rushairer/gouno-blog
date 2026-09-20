# Showcase Parity Certification Protocol

This document defines the acceptance protocol for any claim that a Gouno Blog surface is aligned with the canonical Gouno UI Showcase.

The protocol exists to prevent a recurring failure mode: source markers, migration metadata, green CI, or a narrow rendered comparison were previously treated as proof of whole-page parity even when a human had not compared the real product and Showcase state-by-state.

## Status model

Parity status is independent from migration implementation status.

- `legacy-hardening-complete`: an earlier parity/hardening pass completed under its historical acceptance rules. This is useful engineering evidence, but it is **not** a current manual-first certification.
- `needs-manual-recertification`: the surface has implementation and/or automated coverage, but has not yet completed the current manual-first protocol.
- `verified`: the surface completed the current protocol and has a current certification entry in `showcase-parity-certifications.json`.
- `blocked`: certification cannot proceed because required source, browser evidence, fixture capability, or product behavior is unavailable.

Only `verified` means current Showcase parity has been certified.

## Required order of work

For every surface family:

1. Read the current canonical Showcase implementation and the current real-product implementation before changing code.
2. Inventory visible states that materially change composition: default/loaded, loading, empty, recoverable error/feedback, selection/bulk state, detail, editor/drawer/modal, responsive behavior, theme-sensitive behavior, and privileged state when applicable.
3. Compare composition manually. Do not start from an automated failure list and assume unreported regions are correct.
4. Classify every observed difference as one of:
   - `ui-drift`: product presentation/composition has diverged from the canonical Showcase;
   - `showcase-drift`: the canonical fixture itself no longer represents the intended design language;
   - `intentional-product-divergence`: real business/security behavior legitimately exceeds or differs from the fixture;
   - `data-only-difference`: values/counts/content differ but the design contract does not.
5. Fix confirmed drift without deleting legitimate product behavior.
6. Re-read the changed source and re-run the manual comparison.
7. Run paired rendered/browser verification on the reviewed states.
8. Only after the preceding steps pass, extract stable conclusions into source/AST/browser contracts.
9. Update the certification ledger last. The ledger records evidence; it never creates evidence.

## Minimum evidence for `verified`

A verified entry must record:

- a manual review document;
- the reviewed Blog and Gouno UI refs;
- the exact `@gouno/ui` package baseline;
- covered visible-state categories;
- relevant product-owned paths and canonical Showcase paths;
- browser/parity workflow evidence and retained artifacts;
- intentional product divergences that must not be "fixed" away.

A green test run without this evidence cannot promote a surface to `verified`.

## Invalidation rules

A verified certification becomes stale when any of these occur after its reviewed refs:

- a certified product-owned path changes;
- a canonical Showcase path for that certification changes;
- the consumed `@gouno/ui` version changes;
- a shared composition contract used by the certified surface changes in a way covered by its path set.

When stale, the next change must either:

1. perform a new manual review and refresh the certification evidence, or
2. demote the entry to `needs-manual-recertification`.

Automation may detect staleness, but automation must never auto-promote a stale entry back to `verified`.

## Legacy records

The following are historical evidence, not current certification authorities:

- `migration.json`;
- `MIGRATION.md`;
- earlier Showcase parity hardening reports;
- old CI/browser artifacts.

They remain useful for understanding previous work and regression history. Current certification authority is `showcase-parity-certifications.json`.

## Current rollout

The first surface family certified under this protocol is Blog Admin AI Settings + AI Operations. Existing Blog Admin core/support and Public/Account hardening passes predate this protocol and therefore remain `needs-manual-recertification` until they are reviewed with the same method.
