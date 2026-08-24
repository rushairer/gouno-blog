# Release Checklist

- [ ] Root CHANGELOG, version tag, image tags, and compatibility matrix agree.
- [ ] Backend, seed, frontend, dependency, and vulnerability gates pass.
- [ ] Production Compose rejects missing secrets and image digests.
- [ ] Cookie, CSRF, CORS, callback, authorization, and security-header tests pass.
- [ ] Images have SBOM, provenance, and cosign verification evidence.
- [ ] Isolated containers, networks, volumes, and temporary files are removed.
