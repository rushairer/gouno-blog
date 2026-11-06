# Gouno Blog v1.6.0 candidate release manifest

Status: **blocked / unpublished**. This is a preparation inventory, not a production deployment authorization or a verified release manifest. No v1.6.0 tag, release image digest, signature or SBOM is asserted here.

## Version decision and dependencies

The v1.5.26-to-main diff includes new read-only external capability/API Access administration, provider configuration and guarded image-recovery capabilities, alongside security fixes. A backward-compatible minor v1.6.0 is appropriate; a patch-only v1.5.27 would omit the new capability distinction. Complete API/migration review remains required before final acceptance.

| Component | Required candidate baseline | Published release acceptance |
| --- | --- | --- |
| Blog backend | Core v1.4.0; patched Go 1.27.x | Final Blog SHA and tagged image pending |
| Blog frontend | @gouno/ui 0.4.9; @gosso/client 0.9.3; Node 24 LTS | Final tagged image pending |
| Blog Seed | Patched Go 1.27.x | Final tagged image pending |
| Gosso | v1.7.0@sha256:b88b0475af7633afa8d6fda8ca7c3f4297d235a36e88219d9010818e76ff889a | Published signature/SBOM/Helm acceptance complete; final Blog BFF compatibility still required |
| Gosso Admin | v0.7.25 candidate | Manual Showcase recertification and staging acceptance pending |

## Artifact inventory to complete after authorized publication

| OCI repository | Intended tag | Immutable digest | Exact Cosign identity | SBOM/provenance |
| --- | --- | --- | --- | --- |
| ghcr.io/rushairer/gouno-blog-backend | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |
| ghcr.io/rushairer/gouno-blog-frontend | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |
| ghcr.io/rushairer/gouno-blog-seed | v1.6.0 | PENDING | publish-images.yml@refs/tags/v1.6.0 | PENDING |

Each full identity is `https://github.com/rushairer/gouno-blog/.github/workflows/publish-images.yml@refs/tags/v1.6.0`; issuer must equal `https://token.actions.githubusercontent.com`. Verify each image **by digest** after signing, then retain verification JSON, SPDX/CycloneDX documents, provenance and workflow URLs. Never replace PENDING with main-channel digests.

## Acceptance still required

- Exact final-SHA backend, Seed, frontend, database integration with no skipped required tests, race, vet, govulncheck, dependency review, BFF, browser and image-security gates.
- Direct rendered manual-first review and a PR renewing `blog-admin-ai`; green automated parity does not renew certification.
- Action-by-action approval and recovery limitations tracked in [issue #338](https://github.com/rushairer/gouno-blog/issues/338). Atomic local effects and read-only reconciliation do not establish Provider-side exactly-once execution or billing. The historical cancel/reclaim bypass was remediated; do not report it as an unresolved current vulnerability.
- Review Owner advisory-lock authorization, HTTP error redaction/body caps, OIDC session/PKCE/logout handling and in-document-only JSON Schema references on the final candidate.
- Preserve the Connector product hold. Any unresolved Connector risk must be disclosed and resolved through separately named authorization, never silently changed here.
- Identify staging configuration, backups, rollback points and immutable upstream images; complete the root release checklist. No production target is authorized by this task.

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

`blog-admin-ai` stays **needs-manual-recertification**. Real Chromium comparison
against UI main `b706b6c25c6252c7f55500b69eb08e17c1de554b` found broken Canonical
font delivery: Inter and JetBrains Mono fail in the local source reference and
public Pages requests under `https://rushairer.github.io/src/fonts/` return 404.
Product registry fonts load. Do not change Product fonts or golden images to
hide this difference. The current supplemental review is partial assistant
inspection, not the required completed manual certification.

Admin v0.7.25 is still unpublished; its manual/Staging gates and proposed
[release-test/smoke fixes in PR #97](https://github.com/rushairer/gosso-admin/pull/97)
remain upstream blockers. No authorized Staging target, actual backup-restore or
rollback receipt has been supplied for this closeout. Keep the Connector hold,
confidential BFF, local Owner authorization and all quality ratchets unchanged.
A later merged Blog SHA needs its own acceptance; these main receipts do not
pre-approve a future tag or production deployment.
