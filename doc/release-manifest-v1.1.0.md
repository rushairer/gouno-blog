# Gouno Blog v1.1.0 Release Manifest

This manifest records the immutable inputs for the v1.1.0 release candidate
validation and the digests that must be filled after each application image is
published. A missing digest is a release blocker; `main`, `latest`, and branch
tags are not substitutes.

## Validated release candidates

| Component | Version | Source commit | Evidence |
|---|---|---|---|
| `github.com/rushairer/gouno` | `v1.2.0-rc.1` | `90dce4f60f74b686fa383b5024d16481124afe0a` | GitHub prerelease and Go module proxy |
| `@gosso/client` | `0.4.0-rc.2` | `7d826dcad8815671ae7c197b3a96c8479e9823ea` | npm `next`, registry integrity, and SLSA provenance |

## Third-party production images

Resolved from the registry manifest index on 2026-08-24. Re-resolve and review
any digest change before the stable release.

| Variable | Immutable image |
|---|---|
| `POSTGRES_IMAGE` | `pgvector/pgvector:0.8.6-pg15@sha256:a947c45cdc5906a1bc951f20a8709e321256343ee0f251e4ae00b5e7def4e6da` |
| `REDIS_IMAGE` | `redis:7.4.11-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf` |
| `CADDY_IMAGE` | `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |

## Application images pending stable publication

The following target tags intentionally do not have digests yet. Populate this
table only from the immutable multi-platform manifest produced by the reviewed
stable tag workflow.

| Variable | Required stable tag | Digest |
|---|---|---|
| `GOSSO_IMAGE` | `ghcr.io/rushairer/gosso:v1.2.1` | **BLOCKED — not published** |
| `GOSSO_ADMIN_SEED_IMAGE` | `ghcr.io/rushairer/gosso-admin-seed:v0.3.0` | **BLOCKED — not published** |
| `GOSSO_ADMIN_FRONTEND_IMAGE` | `ghcr.io/rushairer/gosso-admin-frontend-identity-admin:v0.3.0` | **BLOCKED — not published** |
| `GOUNO_BLOG_SEED_IMAGE` | `ghcr.io/rushairer/gouno-blog-seed:v1.1.0` | **BLOCKED — not published** |
| `GOUNO_BLOG_BACKEND_IMAGE` | `ghcr.io/rushairer/gouno-blog-backend:v1.1.0` | **BLOCKED — not published** |
| `GOUNO_BLOG_FRONTEND_IMAGE` | `ghcr.io/rushairer/gouno-blog-frontend:v1.1.0` | **BLOCKED — not published** |

## Stable-release acceptance

- Every application row contains a 64-character `sha256` manifest digest.
- Each `version@sha256` reference resolves to the same manifest as its stable tag.
- Cosign verification, SBOM, and provenance evidence are recorded for every application image.
- The production Compose configuration is rendered with exactly these values.
