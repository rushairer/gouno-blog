# Gouno Blog - AI Agent Architectural & Operational Guidelines

This document defines the **immutable architectural rules, security baselines, and deployment conventions** for AI agents working in this repository.

---

## 1. Architectural Baseline & Security Contract

1. **Split-Domain Confidential BFF Architecture**:
   - Blog is an independent, confidential OAuth 2.0 / OIDC client (`blog-bff`).
   - Browser never handles raw access/refresh tokens; authentication is exclusively maintained via HttpOnly, Secure, SameSite Cookie sessions on the Blog origin (`/api/auth/*`).
   - Split-domain topology (`blog.<domain>` vs `sso.<domain>`) is permanent.
2. **Identity & Authorization**:
   - Blog authorization relies strictly on locally configured owner identity (`Issuer + Subject`).
   - Provider roles/scopes do not grant implicit administrative permissions.
3. **Session & Logout Lifecycle**:
   - Supports local logout, global RP-Initiated logout, and atomic back-channel logout claim handling.
   - Redis session state must strictly prevent resurrection on concurrent refresh/logout.

---

## 2. Container & Image Conventions

1. **Development Integration (`docker-compose.yml`)**:
   - Dynamic tag defaults: `${XXX_IMAGE:-ghcr.io/rushairer/xxx:main}`.
   - Follows latest `main` images across upstream dependencies (`gosso`, `gosso-admin-seed`, etc.) during development.
   - Never hardcode fixed SHA256 digests in development compose files.
2. **Local Source Development (`docker-compose.source.yml`)**:
   - Uses `:local` tag and `build:` contexts for live local code development.
3. **Production Deployment (`docker-compose.production.yml`)**:
   - Requires explicit image parameters (Release tags like `:v1.4.0` or audited immutable digests).
   - Production secrets must be provided via Docker Secret files; raw env var secrets are rejected.

---

## 3. Versioning Guidelines

- Follow Semantic Versioning (SemVer).
- Prior to official public GA release, development and security hardening iterate within the **`1.x`** major series (e.g. `1.4.0`). Major version `2.0.0` is reserved for true generational product milestones.
- Keep `CHANGELOG.md` updated for every release.
