#!/usr/bin/env bash
# Verify the just-published immutable image, not a mutable tag or arbitrary signer.
set -euo pipefail

refuse() {
  printf 'Refusing image signature verification: %s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_REPOSITORY:-}" == 'rushairer/gouno-blog' ]] || refuse 'untrusted repository'
[[ -n "${GITHUB_REF:-}" ]] || refuse 'missing GitHub ref'
case "$GITHUB_REF" in
  refs/heads/main|refs/heads/master) ;;
  refs/tags/*)
    [[ "$GITHUB_REF" =~ ^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$ ]] || refuse 'unsupported release tag'
    ;;
  *) refuse 'untrusted workflow ref' ;;
esac

expected_workflow_ref="${GITHUB_REPOSITORY}/.github/workflows/publish-images.yml@${GITHUB_REF}"
[[ "${GITHUB_WORKFLOW_REF:-}" == "$expected_workflow_ref" ]] || refuse 'unexpected signer workflow identity'

case "${IMAGE_KIND:-}" in
  backend|frontend|seed) ;;
  *) refuse 'unknown image kind' ;;
esac
expected_image="ghcr.io/rushairer/gouno-blog-${IMAGE_KIND}"
[[ "${IMAGE:-}" == "$expected_image" ]] || refuse 'image does not match the approved publication target'
[[ "${DIGEST:-}" =~ ^sha256:[a-f0-9]{64}$ ]] || refuse 'missing or malformed immutable sha256 digest'

identity="https://github.com/${expected_workflow_ref}"
cosign verify \
  --certificate-identity "$identity" \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "${expected_image}@${DIGEST}"
