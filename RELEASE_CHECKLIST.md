# Release Checklist

- [ ] Root CHANGELOG, version tag, image tags, and compatibility matrix agree.
- [ ] `doc/release-manifest-v1.1.0.md` contains immutable digests for every
  already-published downstream application image; Blog's own target rows remain
  blocked until the tag workflow publishes and attaches their digest files.
- [ ] Backend, seed, frontend, dependency, and vulnerability gates pass.
- [ ] Production Compose fails closed unless every first-party application image is supplied as an immutable `version@sha256:digest` reference; third-party images remain digest-pinned and missing secrets are rejected.
- [ ] Cookie, CSRF, CORS, callback, authorization, and security-header tests pass.
- [ ] Authentication deployment contract passes: GOSSO uses
  `/login` on the SSO origin, and Blog does not reintroduce a `/login` route,
  and the exact runtime proxy CIDR is supplied through `GOSSO_TRUSTED_PROXIES`
  and `GOSSO_BACKCHANNEL_ALLOWED_CIDRS` allows only the exact container network needed for back-channel logout; Gosso 1.6+ hard-denies loopback, link-local, metadata, unspecified, and multicast targets even when a broad CIDR is configured.
- [ ] Docker secret files in `/opt/gouno-blog/secrets/*` are present with `chmod 600` permissions.
- [ ] The tag workflow attaches each Blog image digest plus SPDX and CycloneDX
  SBOMs to the GitHub Release; the publish workflow verifies each signed immutable
  digest against the exact workflow OIDC identity and issuer before recording it.
  Independently verify the three selected deployment digests and signatures
  against their release-tag identities, provenance, and operator rollout receipt.
- [ ] Isolated containers, networks, volumes, and temporary files are removed.


## November 2026 ecosystem release candidate

Candidate: **v1.6.0**, not v1.5.27: the diff after v1.5.26 introduces the read-only external capability gateway, API Access management, provider configuration and guarded reconciliation capabilities in addition to security fixes. No candidate tag has been created.

- [ ] Accept the published Gosso v1.7.0 exact immutable image and rerun confidential-BFF compatibility against that digest; the existing v1.6.1 result is historical evidence only.
- [ ] Complete Gosso Admin upstream release acceptance before any Blog tag.
- [ ] Renew the `blog-admin-ai` certification through direct state-by-state rendered Showcase/Product review and a parity-sensitive PR. Current ledger status is `needs-manual-recertification`.
- [ ] Review all v1.5.26-to-final-candidate changes; a green CI does not certify the whole 780-file application diff.
- [ ] Complete all pre-existing backend/Seed/frontend/database, dependency-review, BFF, Browser Acceptance, security and staging/rollback gates on the final SHA.
- [ ] Retain Connector behavior freeze; unresolved Connector error-transport findings cannot be silently patched under this release task.
- [ ] After tagging, independently verify all three image digests and exact `publish-images.yml@refs/tags/v1.6.0` Cosign identities, SBOMs, provenance and release attachments. Signing success is insufficient.

Core stays v1.4.0; frontend registry pins stay @gouno/ui 0.4.9 and @gosso/client 0.9.3. No product, security or certification status is changed by this release-documentation preparation.
