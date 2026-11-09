# Release Checklist

- [ ] Root CHANGELOG, version tag, image tags, and compatibility matrix agree.
- [ ] `doc/release-manifest-v1.6.0.md` contains immutable digests for every
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
- [ ] Review all v1.5.26-to-final-candidate changes; a green CI does not certify the whole application diff. The [November 9 candidate review inventory](docs/quality/blog-v1.6.0-candidate-review-2026-11-09.md) records the exact range and remaining review limits.
- [ ] Complete all pre-existing backend/Seed/frontend/database, dependency-review, BFF, Browser Acceptance, security and staging/rollback gates on the final SHA.
- [ ] Retain Connector behavior freeze; unresolved Connector error-transport findings cannot be silently patched under this release task.
- [ ] After tagging, independently verify all three image digests and exact `publish-images.yml@refs/tags/v1.6.0` Cosign identities, SBOMs, provenance and release attachments. Signing success is insufficient.

Core stays v1.4.0; frontend registry pins stay @gouno/ui 0.4.9 and @gosso/client 0.9.3. No product, security or certification status is changed by this release-documentation preparation.

### November 6 evidence refresh — no release approval

Current main `53d4a7c9eb781b12bc583800fdda3a62af515be2` passed fresh
[Browser Acceptance, 366 tests](https://github.com/rushairer/gouno-blog/actions/runs/42195398048)
and [Showcase Parity, 86 tests](https://github.com/rushairer/gouno-blog/actions/runs/42195404351).
Existing exact-main backend/database/Seed/frontend CI and Gosso v1.7.0 BFF
acceptance are linked in the candidate manifest. No checkbox above is inferred
from those signals alone. The original November6 Canonical font failure is historical (resolved November8);
`blog-admin-ai` remains pending, Admin v0.7.25 remains unpublished, and Staging,
backup restore and rollback acceptance still lack an identified authorized
target and receipts. No target tag/image/signature/SBOM or deployment is claimed.

### November 8 resumed closeout

Canonical delivery is now repaired at UI `d17154139bb217be9cd61b140c78db73b1430b3e`, with187 normal Golden cases, both consumer gates, Pages and actual public font-loading verification passed. This does not renew blog-admin-ai; maintainer review remains mandatory.

Upstream Admin's stronger released-Gosso acceptance exposes failed secret rotation in genuine v1.7.0. Initial-secret Blog BFF compatibility does not cover this defect. The local proposed fix is not a published v1.7.1 baseline; full upstream scope authorization/review/CI/release/artifact and downstream compatibility acceptance are pending. Keep all affected release checkboxes open. No authorized Staging, backup restore or rollback receipts have appeared; no target release or image is accepted. See the candidate manifest and Admin final ecosystem audit for evidence.

The November8 backend image scan also detected HIGH CVE-2026-78661 in x/net0.60.0. Candidate remediation pins x/net0.62.0, preserves other dependency baselines and strengthens the CI downgrade floor. A positive/downgrade probe confirms the guard fails closed. Full final-head CI and immutable image scans must pass; do not suppress the finding or reuse the earlier image success.

### November 9 status — candidate still unpublished

Security remediation merged as `0aee82081676e4c560f7489b5eef8249a6cfc32f`.
Its CI, BFF, Browser Acceptance, Showcase Parity and main-channel Publish Images
runs completed successfully; exact links and their limits are in the
[candidate manifest](doc/release-manifest-v1.6.0.md#november-9-exact-main-evidence-and-candidate-notes).
This resolves the November 8 source/image scan failures on that SHA, not the
remaining upstream, full review, manual or operational gates. No release
checkbox is promoted from those automated results. Formal v1.6.0 images and
independent tag-identity verification remain pending.
