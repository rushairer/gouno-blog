# v1.6.0 maintainer-directed release exception — 2026-11-11

## Authorization and scope

The requesting maintainer explicitly instructed this release session:

> 你去线上 ssh root@io84.com 目测一下吧。其他都默认通过。强行发版吧。

This supersedes the session's earlier instruction to withhold publication pending
manual certification and external Staging acceptance, for this release only.
It is an explicit acceptance of outstanding release risk, **not evidence that
an unperformed check passed**. Prior reviewed source baseline: `ff5f2198a83faef74de459c91edafad8b22cda66`.

## Status retained honestly

- Automated CI, security, browser and release-compatibility gates must still pass
  for the final commit. Failed scans, signatures or publication workflows are
  not waived and must not be hidden.
- Manual-first Showcase recertification remains `needs-manual-recertification`.
  No reviewer, direct human rendered review or certification is fabricated.
- External Staging deployment, target backup/restore, upgrade and rollback
  acceptance remain unperformed/unverified and are waived for publication only.
  The existing isolated recovery receipt retains its original limited scope.
- Existing checklist rows for unperformed work remain unchecked. This exception
  does not change runtime security controls, tests, thresholds or repository rules.
- Earlier Admin PR #97 was merged before this exception; its review status is
  not inferred from merge status.
  Any further independent approval absent from this metadata PR is explicitly
  part of the requested publication exception; GitHub-enforced rules remain intact.

## Production observation — not deployment acceptance

SSH read-only access to `io84.com` succeeded. The local operational constraints
were read and all unrelated host services/configuration were preserved.
Admin login, SSO readiness, Blog homepage and Blog `/health` returned HTTP 200.
The four application containers use floating `:main` references, so this running
installation does not validate the target release images or exact candidate SHA.
The available native browser could not open a usable window/tab; consequently
no new online visual review, authenticated UI test or screenshot is claimed.
No production secret, account mutation, deployment or service restart occurred.

## Completion terminology

Publication may proceed under this exception after the final automated checks.
`Release Published` is separate from `Manual Certification Ready`,
`Staging Ready`, and `Production Deployed`. Full original release-train quality
closure remains incomplete until those actual receipts exist.
