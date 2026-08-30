# Release Checklist

- [ ] Root CHANGELOG, version tag, image tags, and compatibility matrix agree.
- [ ] `doc/release-manifest-v1.1.0.md` contains immutable digests for every
  already-published downstream application image; Blog's own target rows remain
  blocked until the tag workflow publishes and attaches their digest files.
- [ ] Backend, seed, frontend, dependency, and vulnerability gates pass.
- [ ] Production Compose rejects missing secrets and image digests.
- [ ] Cookie, CSRF, CORS, callback, authorization, and security-header tests pass.
- [ ] Authentication deployment contract passes: GOSSO uses
  `/login` on the SSO origin, and Blog does not reintroduce a `/login` route,
  and the exact runtime proxy CIDR is supplied through `GOSSO_TRUSTED_PROXIES`.
- [ ] The tag workflow attaches each Blog image digest plus SPDX and CycloneDX
  SBOMs to the GitHub Release; provenance and cosign verification succeed.
- [ ] Isolated containers, networks, volumes, and temporary files are removed.
