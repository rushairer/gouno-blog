# Gouno Blog v1.6.0 candidate release manifest

Current status (November 11): **candidate / not yet published**. Gosso v1.7.2 and GOSSO Admin v0.7.25 have completed formal publication and separate immutable-artifact verification. Final Blog commit checks and its own versioned images remain pending. Manual Showcase certification and external Staging are unverified under the [explicit maintainer publication exception](../docs/quality/release-exception-2026-11-11.md); they are not marked passed. Historical dated sections below retain their original scope. No production deployment is authorized.

## Version decision and dependencies

The v1.5.26-to-main diff includes new read-only external capability/API Access administration, provider configuration and guarded image-recovery capabilities, alongside security fixes. A backward-compatible minor v1.6.0 is appropriate; a patch-only v1.5.27 would omit the new capability distinction. Complete API/migration review remains required before final acceptance.

| Component | Required candidate baseline | Published release acceptance |
| --- | --- | --- |
| Blog backend | Core v1.4.0; patched Go 1.27.x; x/net v0.62.0 | Final Blog SHA and tagged image pending |
| Blog frontend | @gouno/ui 0.4.9; @gosso/client 0.9.3; Node 24 LTS | Final tagged image pending |
| Blog Seed | Patched Go 1.27.x | Final tagged image pending |
| Gosso | v1.7.2@sha256:bf398c6c2129da2f68c030dece3ceb52f8f5a7a6036a58b797c8e3f0619b5e90 | Formal patched release; exact-identity signature, both architectures, patched toolchain SBOM, signed CycloneDX attestation, Helm OCI and Go Proxy independently verified. Final Blog BFF acceptance follows this digest. |
| Gosso Admin | [v0.7.25](https://github.com/rushairer/gosso-admin/releases/tag/v0.7.25), source `4545495bcdc518af65cc6c15a9695b9ef5df5e19` | [Independent acceptance 42997051605](https://github.com/rushairer/gouno-doc/actions/runs/42997051605) verifies frontend, identity-admin variant and Seed digests, exact Cosign identity, SPDX/CycloneDX, both architectures and declared source provenance. Manual certification and Staging remain waived/unverified. |

## Artifact inventory to complete after authorized publication

| OCI repository | Intended tag | Immutable digest | Exact Cosign identity | SBOM/provenance |
| --- | --- | --- | --- | --- |
| ghcr.io/rushairer/gouno-blog-backend | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |
| ghcr.io/rushairer/gouno-blog-frontend | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |
| ghcr.io/rushairer/gouno-blog-seed | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |

Each full identity is `https://github.com/rushairer/gouno-blog/.github/workflows/publish-images.yml@refs/tags/v1.6.0`; issuer must equal `https://token.actions.githubusercontent.com`. Verify each image **by digest** after signing, then retain verification JSON, SPDX/CycloneDX documents, provenance and workflow URLs. Never replace PENDING with main-channel digests.

## Final Blog acceptance and publication exception

- Exact final-SHA backend, Seed, frontend, database integration with no skipped required tests, race, vet, govulncheck, dependency review, BFF, browser and image-security gates.
- Manual-first `blog-admin-ai` certification remains unverified under the owner exception. Green automated parity does not renew certification.
- Action-by-action approval and recovery limitations tracked in [issue #338](https://github.com/rushairer/gouno-blog/issues/338). Atomic local effects and read-only reconciliation do not establish Provider-side exactly-once execution or billing. The historical cancel/reclaim bypass was remediated; do not report it as an unresolved current vulnerability.
- Review Owner advisory-lock authorization, HTTP error redaction/body caps, OIDC session/PKCE/logout handling and in-document-only JSON Schema references on the final candidate.
- Preserve the Connector product hold. Any unresolved Connector risk must be disclosed and resolved through separately named authorization, never silently changed here.
- External Staging, target backup/upgrade/rollback and operator acceptance remain unverified under the explicit publication exception. Immutable upstream references are now verified. No production deployment is authorized.

Keep actual deployment configuration and secrets outside this manifest. Add the completed immutable artifact evidence in a post-publication documentation commit without moving the validated tag.

## November 6 final-closeout verification

This manifest remains **blocked / unpublished**. Current audited main is
`53d4a7c9eb781b12bc583800fdda3a62af515be2`; remote `v1.6.0` is absent.
The formal version remains v1.5.26. No main-channel digest replaces any PENDING
release row above.

| Exact-main evidence | Result |
| --- | --- |
| [CI 42016283335](https://github.com/rushairer/gouno-blog/actions/runs/42016283335) | Backend race/vet/govulncheck, required isolated PostgreSQL integration, Seed, frontend quality/coverage/build, Compose and image contract passed; dependency review is event-skipped on main, not a PR-review pass |
| [Gosso v1.7.0 BFF 42016283306](https://github.com/rushairer/gouno-blog/actions/runs/42016283306) | Passed against the pinned published image; confidential seed, PKCE/resource audience, refresh, HttpOnly login flow, HTTPS back-channel logout and revocation exercised |
| [Browser Acceptance 42195398048](https://github.com/rushairer/gouno-blog/actions/runs/42195398048) | 366 passed on Ubuntu 24.04 |
| [Showcase Parity 42195404351](https://github.com/rushairer/gouno-blog/actions/runs/42195404351) | 86 passed; not manual certification |
| Supplemental native-browser interaction subset | 23 passed on macOS; delayed stale success/error, pending-read invalidation, selection/refresh ownership and related AI interactions; fixture presentation evidence only |

Browser artifact: `13492610459`, API archive digest
`sha256:b1c85023f59ccc94363d5f20cd3a4d0e90379423a3f438f360cf3c56b9216b58`.
Parity artifact: `13492445481`, API archive digest
`sha256:e4c594f58407393975c06c1d86e664463ad7a4a30ebc2649d65694c65c40f7d0`.
Download/hash receipts are retained separately; an API digest alone is not a
claim of independent archive verification or visual approval.

`blog-admin-ai` stays **needs-manual-recertification**. The November6 Canonical font defect was fixed in [UI PR #161](https://github.com/rushairer/gouno-ui/pull/161), merged at `d17154139bb217be9cd61b140c78db73b1430b3e`. [Normal Golden 42206493211](https://github.com/rushairer/gouno-ui/actions/runs/42206493211) passed187; both consumer gates and Pages passed. Real public Chromium on November8 confirmed both font faces loaded via HTTP200 and match published0.4.9 bytes. UI/Client package pins are unchanged. Required direct state review and maintainer certification are still pending; automation cannot sign the ledger.

## November 8 upstream correctness and operational blockers

Admin v0.7.25 remains unpublished. [Its stronger official-image compatibility check](https://github.com/rushairer/gosso-admin/actions/runs/42203332667) proves Gosso v1.7.0 does not persist rotated Client Secrets: the retired secret authenticates and the returned secret receives invalid_client. Signing/SBOM provenance does not establish feature correctness. Existing Blog BFF success uses initial credentials and does not certify rotation.

A [concrete tested local patch and receipt](https://github.com/rushairer/gosso-admin/pull/97) proposes a narrow dedicated secret CAS, with real database owner/admin/rollback/concurrency regressions and additional race fixes. It is **not an upstream merged or released patch**. Gosso is read-only under the current task; v1.7.1 requires a scope exception and full independent upstream publication/compatibility acceptance. Keep the baseline table on the actual published v1.7.0 until a real replacement is accepted; do not substitute Gosso main/local images.

No authorized Staging target, actual backup-restore or rollback receipt has been supplied. Admin release, manual certification and operational gates remain open. No target Tag, own image digest, signature or SBOM is asserted. Keep Connector behavior freeze, confidential BFF/local Owner authorization and quality ratchets unchanged. Final merged Blog SHA needs its own acceptance. The formal version remains v1.5.26.

## November 8 image-scan security remediation

The documentation-head image run [42440708333](https://github.com/rushairer/gouno-blog/actions/runs/42440708333) newly fails backend HIGH scanning on `golang.org/x/net v0.60.0`, `CVE-2026-78661`. [Official Go advisory GO-2026-6860](https://pkg.go.dev/vuln/GO-2026-6860) fixes HTML parser quadratic resource consumption in v0.62.0. The candidate now pins v0.62.0 with matching verified checksums and raises its fail-closed downgrade floor. Keep unrelated inherited requirements and all scanner thresholds intact. New final-head backend/database/dependency/image gates are required; historical green builds do not certify this update. No production deploy or target release is asserted.

The same resumed image run independently finds Critical `CVE-2026-4738` in runtime zlib1.3.2-r1 via Grype. All three runtime Dockerfiles now pin Alpine zlib1.4-r0, confirmed installable on the existing immutable Alpine/Nginx bases; the runtime contract's exact-pin expectations advance with it. [Upstream zlib1.4 release notes](https://zlib.net/) include the fix. Nginx configuration validation passes with the patched package. Both scanners and severity cutoffs remain required. Final source-head multiarchitecture image builds and both scans must pass before acceptance.

## November 9 exact-main evidence and candidate notes

The security fixes were merged through [PR #415](https://github.com/rushairer/gouno-blog/pull/415).
Audited main is now `0aee82081676e4c560f7489b5eef8249a6cfc32f`.
The following runs were independently re-queried on November 9: all are
`completed/success` and name that exact SHA. Earlier sections are historical
receipts, not the current candidate acceptance summary.

| Exact-main workflow | Verified result and limit |
| --- | --- |
| [CI 42441728669](https://github.com/rushairer/gouno-blog/actions/runs/42441728669) | Backend/database/Seed/frontend gates passed. Dependency review is event-skipped on main; the PR review result remains separate. |
| [Gosso BFF 42441728635](https://github.com/rushairer/gouno-blog/actions/runs/42441728635) | Passed against published v1.7.0; does not exercise its broken rotated credentials. |
| [Browser 42441728615](https://github.com/rushairer/gouno-blog/actions/runs/42441728615) | 366 passed; not maintainer certification. |
| [Parity 42441728617](https://github.com/rushairer/gouno-blog/actions/runs/42441728617) | 86 passed; ledger remains needs-manual-recertification. |
| [Publish Images 42441728746](https://github.com/rushairer/gouno-blog/actions/runs/42441728746) | Main-channel builds, scans, workflow signature verification and SBOM publication passed. These are development artifacts, not v1.6.0 images. |

The [candidate review and reproducible inventory](../docs/quality/blog-v1.6.0-candidate-review-2026-11-09.md)
records 810 diff entries from v1.5.26 to this main, including 15 detected
renames. The inventory is not approval of all changed code. Unreleased notes
are curated against current dependencies and Dockerfiles; historical released
changelog sections remain byte-for-byte unchanged.

Admin remains unpublished, its official-Gosso compatibility gate still fails,
and manual certification and authorized Staging receipts remain absent.
The v1.6.0 tag/Release and the formal artifact rows above remain pending.
Any later candidate SHA must obtain its own required checks before tagging.


## November 9 Gosso rotation repair publication

The user authorized upstream repair and publication. [Gosso PR54](https://github.com/rushairer/gosso/pull/54)
merged at `6c8ced618408f3625bbf022b67a08980a26a807d`; full exact-main CI and
[Release42603651807](https://github.com/rushairer/gosso/actions/runs/42603651807)
passed. Annotated v1.7.1 and [formal Release](https://github.com/rushairer/gosso/releases/tag/v1.7.1)
exist; v1.7.0 was preserved. Independently verified release index:
`sha256:cdf81b3e6f532455aa8964e7921355c54e3bfca72bf5910cd21689d87fe80cbb`.
Cosign exact `release.yml@refs/tags/v1.7.1` identity/issuer verification, both
platforms' provenance source SHA, SPDX/CycloneDX JSON, Helm OCI1.7.1 metadata and
public Go Module Proxy checks pass. Historical read-only/absent-patch blockers
above are superseded by this publication. Fresh Admin rotation and Blog BFF
acceptance must use this actual released digest. Neither downstream candidate
is published; manual certification, authorized Staging and full final acceptance
remain required. Blog's own formal artifact rows remain PENDING.
