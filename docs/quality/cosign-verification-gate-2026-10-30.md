# 2026-10-30: A+ immutable image Cosign verification gate

Status: **candidate until final-head CI, exact-release signature verification and main publication receipts are accepted**. Base main: `6a652cd638b28da2a485b687f940693b9dbca6ba`.

## Root cause

The existing `.github/workflows/publish-images.yml` builds, scans, signs and records each backend, frontend and Seed image by immutable digest, but a successful `cosign sign` step alone does **not** independently verify its Fulcio certificate identity, issuer or image digest. The project release checklist already demands provenance and Cosign verification. No evidence from a release receipt may be inferred merely from the presence of a signature.

Sigstore's documented GitHub Actions identity is `https://github.com/OWNER/REPO/.github/workflows/FILE@refs/heads/BRANCH` (or `@refs/tags/TAG`) with OIDC issuer `https://token.actions.githubusercontent.com`. See https://docs.sigstore.dev/quickstart/quickstart-ci/ and https://docs.sigstore.dev/quickstart/verification-cheat-sheet/.

## Safeguard and operations

The shared `.github/scripts/verify_image_signature.sh` executes **after signing and before recording the digest** for all three image jobs. It refuses to call `cosign` unless:
- The invoking repository is **exactly** `rushairer/gouno-blog` and the current GitHub workflow identity is exactly that repository's `.github/workflows/publish-images.yml` at the matching trusted ref.
- The ref is `refs/heads/main`, `refs/heads/master`, or a strict SemVer `refs/tags/vMAJOR.MINOR.PATCH[-PRERELEASE]`; a manual dispatch from an untrusted branch fails closed.
- The image is the exact registry path `ghcr.io/rushairer/gouno-blog-(backend|frontend|seed)` matching the current job's `IMAGE_KIND`.
- The image digest is a lowercase 64-hex `sha256:` reference, not a mutable tag.
- `cosign verify` validates the exact image@digest with `--certificate-identity` set to the **literal** current GitHub workflow URI and `--certificate-oidc-issuer=https://token.actions.githubusercontent.com`. No regexp wildcard identity, `--check-claims=false`, ignored transparency log or fail-open behavior is allowed.

The project retains signing with `cosign sign --yes` and digest/both SBOM uploads. CI now runs five self-contained `unittest` tests (including all three images; main/master/tag references; thirteen invalid or spoofed execution contexts; and a fake Cosign nonzero-exit probe), plus the independent static publication-security checks. The image selection policy marks a change to the shared verification script as a full three-image publish event to ensure the policy is exercised against **real GHCR-backed signatures**, not just a mock.

## Acceptance and limits

1. Full current Go, DB 115 required, frontend 61-warning ratchet, Node tests, all image build/security, Showcase 86 and Chromium 363 gates run against the **exact candidate head**. Test assertions ensure the actual three `Sign → Verify → Record` step orders.
2. Since pull-request image jobs only build/scan (no GHCR publish), **merge only after all applicable PR checks pass and explicit review of this security control**. After merge, **do not declare this sub-gate closed** until the main `Publish Images` workflow republished **all three** images and each real `cosign verify` step succeeded with exact image@digest and trusted identity, before artifact upload. Investigate an identity mismatch rather than weakening the verifier.
3. A successful main publish is still **not** release-tag or production-deployment acceptance: release-tag identity differs, and operators must verify independently that the *actual deployed* immutable digests match trusted signatures/SBOM/provenance, with a documented rollback rehearsal. Current release checklist stays open until those human-verified receipts exist.
4. Do not touch frozen Connector behavior, SSO/BFF token handling or certified Gouno UI Product source under this batch.

Unrelated A+ blockers remain: 61 React/Lint warnings, `ToolBindingsEditor` JSON accepted/draft state analysis and visual recertification, #338 action-specific operator recovery exercises, indirect error-response transport review, production CWV, and #359 full risk signoff.
