# Gouno Blog v1.1.0 Release Manifest

This manifest records the immutable inputs for the v1.1.0 release candidate
validation and the digests that must be filled after each application image is
published. A missing digest is a release blocker; `main`, `latest`, and branch
tags are not substitutes.

> **Historical release record:** this is the v1.1.0 candidate snapshot, not a
> current deployment inventory. Use `docker-compose.production.yml` together
> with the release being deployed to determine the required image references.

## Validated release candidates

| Component | Version | Source commit | Evidence |
|---|---|---|---|
| `github.com/rushairer/gouno` | `v1.2.0` | `96b58e8593f96f04698e8bce262783a453023e25` | GitHub release and Go module proxy |
| `@gosso/client` | `0.4.0` | `a2b6b7ef912c59a33c6f16beb9940b0ef7a6e6da` | npm `latest`, registry integrity, and SLSA provenance |

## Third-party production images

Resolved from the registry manifest index on 2026-08-24. Re-resolve and review
any digest change before the stable release.

| Variable | Immutable image |
|---|---|
| `POSTGRES_IMAGE` | `pgvector/pgvector:0.8.6-pg15@sha256:a947c45cdc5906a1bc951f20a8709e321256343ee0f251e4ae00b5e7def4e6da` |
| `REDIS_IMAGE` | `redis:7.4.11-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf` |
| `CADDY_IMAGE` | `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |

## Application images

Rows remain blocked until their immutable multi-platform manifest has been
produced by the reviewed stable tag workflow.

| Variable | Required stable tag | Digest |
|---|---|---|
| `GOSSO_IMAGE` | `ghcr.io/rushairer/gosso:v1.2.1` | `sha256:cb2934d6aa6ca2c57dca097509101dc01801afce0ffc19f2105aa5143c7f0b18` |
| `GOSSO_ADMIN_SEED_IMAGE` | `ghcr.io/rushairer/gosso-admin-seed:v0.3.0` | `sha256:d0ae84d2bf4d1fff4498ed617e83eea271823d5f290411f046e9f54b7bfae5a2` |
| `GOSSO_ADMIN_FRONTEND_IMAGE` | `ghcr.io/rushairer/gosso-admin-frontend-identity-admin:v0.3.0` | `sha256:cf494f8e043f570054392e18b79caa4c7408fbe41616d28b660c4710b1ee5b8b` |
| `GOUNO_BLOG_SEED_IMAGE` | `ghcr.io/rushairer/gouno-blog-seed:v1.1.0` | **BLOCKED — not published** |
| `GOUNO_BLOG_BACKEND_IMAGE` | `ghcr.io/rushairer/gouno-blog-backend:v1.1.0` | **BLOCKED — not published** |
| `GOUNO_BLOG_FRONTEND_IMAGE` | `ghcr.io/rushairer/gouno-blog-frontend:v1.1.0` | **BLOCKED — not published** |

Gosso `v1.2.1` was built from commit
`31ce86436c3021ac68feb189fdc7772ff1a74c44`. Gosso Admin `v0.3.0` was built
from commit `4efa6122a46351d22dfb40e40b66fe562325a913`. Their tag workflows passed
multi-platform builds, keyless Cosign signing, SBOM generation, provenance,
and GitHub Release publication. The unprefixed Admin frontend image, although
not consumed by this Compose file, was also published at
`ghcr.io/rushairer/gosso-admin-frontend:v0.3.0@sha256:a17bd6cf9bf8ebcbe43072657c53ba631d388e6e3c7e5cf7ef5dfb1471f9d761`.

## Stable-release acceptance

- Every application row contains a 64-character `sha256` manifest digest.
- Each `version@sha256` reference resolves to the same manifest as its stable tag.
- Cosign verification, SBOM, and provenance evidence are recorded for every application image.
- The production Compose configuration is rendered with exactly these values.
