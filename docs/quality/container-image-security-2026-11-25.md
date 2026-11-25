# Container image security remediation — 2026-11-25

Status: candidate implementation; CI and merge verification pending. Baseline: `cb994f30c16e541b33f4e77afad080317a57850d`. This is a point-in-time evidence record, not a release or deployment acceptance.

## Verified failure evidence

- [#427 frontend image job](https://github.com/rushairer/gouno-blog/actions/runs/45061431756/job/137328001794): Trivy reported critical/high findings for Nginx 1.30.6-r1; listed fixes in 1.30.7-r0.
- [#429 backend image job](https://github.com/rushairer/gouno-blog/actions/runs/45066119184/job/137342520709) and [Seed job](https://github.com/rushairer/gouno-blog/actions/runs/45066119184/job/137342520447): Grype reported high findings for libcrypto3/libssl3 3.5.9-r0 (CVE-2026-95692, CVE-2026-107496, CVE-2026-95691 and CVE-2026-88823); listed fixes in 3.5.9-r1.
- [#434](https://github.com/rushairer/gouno-blog/pull/434) and [#435](https://github.com/rushairer/gouno-blog/pull/435) separately proposed the same Go 1.27.4 builder digest. The [#435 Compose job](https://github.com/rushairer/gouno-blog/actions/runs/45072721070/job/137363071615) rejected divergent Backend/Seed digests. Preserve this fail-closed check.

## Candidate scope

- Synchronize both Go builders to the index from #434/#435, sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280.
- Refresh both Alpine runtime bases to the [official Alpine 3.24.4 index](https://hub.docker.com/layers/library/alpine/latest/images/sha256-0f49f331d9212aff11b932863be4eb01cdf962969aa86dab7d1ee21ac6f5f52b), sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf.
- Use the [official Nginx 1.30.7 slim index](https://hub.docker.com/layers/library/nginx/1.30.7-alpine-slim/images/sha256-e2fc266695cef82e3a686c7ed628d1f09c2a7bb5ffb2a718ae7f7c821f5583c1?tab=layers), sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55; retain non-root static serving and the runtime contract.
- Pin both OpenSSL shared libraries to 3.5.9-r1 in Backend/Seed builder/runtime stages and frontend runtime. See the [Alpine package index](https://pkgs.alpinelinux.org/packages?arch=x86_64&branch=v3.24&name=openssl&repo=main). A package listing or index alone does not establish that the built images are safe.
- Add exact package pin/floor and Nginx version regressions. Configure shared Docker updates with [cross-directory dependency-name grouping](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#group-by-groups), preserving the independent Go digest guard. Confirm actual future grouped Dependabot behavior separately.
- Do not change application code, BFF, database migrations, Connector, scanner severity, exclusions or UI certification.

## Required verification

- Full candidate CI, including Go security/compose, image security contracts, frontend/Seed and actual isolated PostgreSQL integration.
- Build all three images, run both existing Trivy and Grype gates and frontend runtime verification. No skipped scans or previous-image substitution.
- Recheck exact candidate and main SHAs and required jobs before merge and inspect the post-merge publish results (including signatures). Do not close #434/#435 until the exact synchronized update is integrated.
- Independently verify multiarchitecture release images at release/deployment time; do not present this candidate or an amd64 PR check as complete release acceptance.

No production deployment, version tag, operational recovery sign-off or manual UI certification is implied.
