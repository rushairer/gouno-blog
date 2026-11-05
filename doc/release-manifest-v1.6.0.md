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
