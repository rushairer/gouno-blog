# Blog v1.6.0 candidate review — November 9, 2026

Status: **candidate / blocked / unpublished**. This document curates release
scope and records bounded verification. It is not a complete source-review
approval, manual certification or deployment receipt.

## Exact scope and reproducibility

- Published baseline: `v1.5.26`, commit `107ee2e28eb96bda1409926fdb324550bb1bae98`.
- Audited main: `0aee82081676e4c560f7489b5eef8249a6cfc32f`.
- [Machine-readable inventory](blog-v1.6.0-diff-inventory-2026-11-09.json): 810
  entries, comprising 529 additions, 191 modifications, 75 deletions and 15
  Git-detected renames. Only seven renames have a 100% similarity score.
- Reproduce with `git diff --name-status --find-renames=80% v1.5.26 0aee82081676e4c560f7489b5eef8249a6cfc32f`.

The inventory includes 370 entries under `blog-backend/internal`, 187 under
`blog-frontend/src`, 59 under `docs/ui-redesign`, 48 under `docs/quality` and
30 under `blog-frontend/e2e`. These are destination-path counts; deletions and
renames are not proof of preserved behavior. Internal capability ownership
moves must be distinguished from new public APIs during final review.

## Release classification and operational impact

The read-only External Capability Gateway, API Access management, Provider
configuration and guarded generation reconciliation introduce actual
backward-compatible capabilities. The candidate remains a minor **v1.6.0**,
subject to complete API/migration review. A patch-only v1.5.27 would not describe
those additions. No published version heading or tag is created by these notes.

The curated root Unreleased section reports final candidate behavior and pins,
rather than repeating intermediate candidate dependency steps. Existing
v1.5.26 and earlier entries remain unchanged. Important upgrade constraints:

- [Identity migration](adr-q01a-identity-migrations.md): back up the actual
  database and stop old-version writes before upgrading. Historical records
  without provable identity can stop migration until exact mappings are
  separately approved. Fresh-install success is not a production upgrade test.
- [Agent uncertain approvals](agent-approval-in-doubt-recovery.md): no automatic
  replay or SQL status reset after an ambiguous effect/commit.
- [Image recovery](media-generation-manual-recovery.md): separately authorize
  and record the exact attempt after independent Provider/object/billing
  investigation. Correlation IDs do not establish external exactly-once effects.
- [Production images](../../docker-compose.production.yml): immutable first-party
  version-and-digest references and file-based secrets remain required. No
  production target or operation is authorized by this document.

## Security review map and limits

| Boundary | Relevant current evidence | Remaining release condition |
| --- | --- | --- |
| Agent transaction and generation recovery | Recovery runbooks above; database/race CI at the exact audited SHA | Complete final diff review and actual incident/upgrade operating acceptance; tests do not prove Provider delivery/billing |
| BFF/OIDC and session isolation | [Signed OIDC regressions](authbff-signed-oidc-coverage-2026-10-14.md), [80% fail-closed ratchet](authbff-fail-closed-80pct-2026-10-14.md), exact-main BFF run linked in the manifest | Accept upstream Admin first; Blog BFF and Admin rotation are separately exercised against formally released Gosso v1.7.1; retain final-SHA acceptance |
| Owner mutation authorization | [Owner concurrency review](access-owner-mutation-2026-10-13.md), real PostgreSQL CI | Review final access-module changes and operator role/rollback scenarios |
| HTTP errors and body limits | Scoped transport guards and handler fault tests; root AGENTS distinguishes direct guards from indirect paths | Finish capability-by-capability review; frozen Connector findings are unresolved risks, not silently waived |
| Workflow Schema resources | [Local-reference review](workflow-schema-local-reference-2026-10-29.md); current compiler rejects external loaders and tests both authoring and execution against a readable file | Retain local-fragment behavior and reject external resource loading on final SHA |
| Dependency/image supply chain | x/net v0.62.0; all three runtimes use zlib1.4-r0; exact-main CI and main image scans pass | Independently verify each formal v1.6.0 digest, exact tag identity, SBOM and provenance after authorized publication |
| Product visual/interaction states | Automated Browser 366 and Parity 86 passed at audited main | Direct rendered state review and required maintainer sign-off; ledger remains needs-manual-recertification |

Historical focused reviews and green tests are inputs to final review, not
proof that all 810 entries have been approved. Connector behavior remains
frozen. No source, certification ledger, coverage threshold, scan threshold or
business contract is changed by this documentation batch.

## Current compatibility and readiness

Backend and Seed declare Go 1.27.3. Backend uses Core v1.4.0, x/net v0.62.0,
go-jose/v4 v4.1.6 and Tink v2.9.0. Frontend keeps exact @gouno/ui0.4.9 and
@gosso/client0.9.3 with Node `>=24.15 <25`. The actual frontend uses the minimal
Nginx slim runtime with pcre2/zlib pins; older full-Nginx package lists in
intermediate candidate notes are not current runtime requirements.

| State | Current conclusion |
| --- | --- |
| Code Ready | Not fully accepted: source security fixes merged, full release diff review still open |
| CI Ready | Exact main 1bbd1025 passed CI42605601742 and released-Gosso BFF42605601789; any later release SHA needs its own checks |
| Manual Certification Ready | No; blog-admin-ai is needs-manual-recertification |
| Staging Ready | No identified authorized target or actual restore/rollback receipts |
| Release Published | No; formal release remains v1.5.26, v1.6.0 is absent |
| Production Deployed | Not performed or asserted |
| Release Complete | **No** |

See the [candidate manifest](../../doc/release-manifest-v1.6.0.md#november-9-exact-main-evidence-and-candidate-notes)
for historical run URLs. Gosso v1.7.1 is now formally released at
6c8ced618408f3625bbf022b67a08980a26a807d, with independently verified index
`sha256:cdf81b3e6f532455aa8964e7921355c54e3bfca72bf5910cd21689d87fe80cbb`.
[Final-main BFF42605601789](https://github.com/rushairer/gouno-blog/actions/runs/42605601789)
and [Admin rotation42763310175](https://github.com/rushairer/gosso-admin/actions/runs/42763310175)
pass against this released baseline. The earlier upstream read-only scope and
unpublished patch blockers are resolved. Admin itself remains unpublished,
with required approving review, manual certification and Staging gates open.
The existing published compatibility matrix must retain actual formal versions.

Five new dependency PRs (#416–#420) were observed open on November 9. They are
not part of this candidate's accepted SHA and have not been merged by this
release task. Incorporating one would require compatibility/security review and
fresh appropriate checks, not automatic inclusion to make the candidate newer.
