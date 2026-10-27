# 2026-10-27 npm audit gate restoration — undici

## Trigger and scope

- After #383 merged as `71835ea1f03bbd0c376aa63154095e65eb202933`, new main CI run **40534498383** failed its **frontend `npm audit --audit-level=moderate`** step; backend quality, isolated PostgreSQL, Image contract and Seed jobs passed. This post-merge CI failure must not be recorded as green merely because #383's PR SHA passed earlier.
- Frontend lockfile pinned **undici 8.11.2** only as a `dev: true` transitive of **jsdom** (`^8.11.2`). The initial review found one installed high-severity vulnerable package, encompassing three GitHub advisory IDs.
- Advisory refs: `GHSA-4qv8-2p9j-2685` (EventSource DoS), `GHSA-f72v-6w45-q472` (mixed-case SRI bypass), `GHSA-xjj6-f33q-929c` (excess Content-Encoding DoS). Upstream states **8.12.2** is the patched 8.x baseline for all three (published October 2026).
- The lockfile-only resolution moves exactly `node_modules/undici` from 8.11.2 to 8.12.2 within jsdom's existing semver range. No application source, @gouno/ui/@gosso/client, prod dependencies, image publishing gates or audit threshold changed.
- `resolved` is the official npm tarball URL; `integrity` is a published SHA-512 lockfile digest, to be independently verified by actual **`npm ci`**, followed by `npm audit`, full frontend quality, and frontend image runtime/security scans in PR CI. Local network DNS prevented a direct npm install, so no local pass is claimed.

## Required acceptance

1. Exact hotfix PR head: `npm ci` must validate registry tarball and SHA-512; `npm audit --audit-level=moderate` must succeed **without allowlist or severity changes**.
2. Complete CI, Images, Browser Acceptance, Showcase Parity as triggered by this change, with artifact and scanner checks. A lockfile-only change should not make claims about manual UI redesign.
3. After SHA-guarded merge, confirm main head and fresh main CI; don't equate a successful Publish Images workflow with a successful frontend audit.
4. Keep #359 open for broader dependency reachability, react correctness and A+ release governance. Connector hold is untouched.
