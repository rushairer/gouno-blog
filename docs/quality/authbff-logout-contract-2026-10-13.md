# Confidential BFF logout contract and security-coverage ratchet — 2026-10-13

This security batch is an incremental improvement towards [A+ release-quality closure #359](https://github.com/rushairer/gouno-blog/issues/359). It does **not** weaken or replace the existing GOSSO identity/BFF interoperability checks.

## Observed protocol and operational defects

1. The legacy optional `postLogoutRedirect` argument to `Client.LogoutURL` could replace the exact registered OIDC `post_logout_redirect_uri` with a local route such as `/admin`, even though the normal HTTP logout route passed an empty argument. This violated the documented registered-callback contract for any other Go caller.
2. `logoutHandler` ignored `Client.LogoutURL` errors. After deleting the local BFF session it could return `{"ok":true,"logout_url":""}` even when the global/RP-Initiated state nonce or endpoint URI could not be initialized. This misleading success hid the incomplete OP logout.
3. `callbackHandler` logged raw OAuth/provider verification and Redis/MFA evidence errors. A provider-controlled `error` query or internal wrapped cause could contaminate the application log even though its HTTP response was generic.

## Changes and confidentiality rules

- Keep `LogoutURL`'s public Go signature for compatibility. The optional local destination argument is *not* an OP redirect. Always set `post_logout_redirect_uri` to the registered `Config.PostLogoutURL` only; if no registered callback is configured, omit it rather than forwarding any alternate. Preserve `client_id`, secure single-use logout `state` and the no-`id_token_hint` rule.
- An authenticated local logout clears the secure host-only cookie and invalidates the local session before RP discovery. If initializing global logout fails, return a fixed HTTP 503 `unable to initialize global logout`, not a false `ok=true` nor any secret. Successful logout and callback behavior are otherwise unchanged.
- Keep server logs as **constant, non-sensitive diagnostic events** for interactive OIDC callback and MFA evidence persistence failures. Do not log decoded OAuth errors, private tokens or Redis connection details.
- No Provider credentials exposed to the browser, no cross-domain cookie, no wildcard CORS, no compatibility `/login` redirect, no Connector module or frontend edits.

## Security-regression evidence (must run)

- `internal/authbff/boundary_contract_hardening_test.go`: validation matrix for HTTPS/same-origin/OIDC scopes/AAL2/Host cookie/TTL constraints; verify client-provided local or external return paths cannot replace registered RP callback; token values not emitted in browser logout URL; nonce consumed once; malformed endpoint or state initialization cannot produce global logout false success; verify callback does not return attacker-controlled values.
- `internal/authbff/redis_security_boundary_test.go`: Redis-backed logout lease owner fencing, expired-owner protection, AEAD ciphertext binding to exact kind/handle, single-use PKCE flow, and finite recent-MFA evidence TTL.
- Keep existing `internal/authbff` tests, Go `-race` and govulncheck, protected database integration, BFF compatibility, multiarch Trivy/Grype image builds, and Showcase Parity. Record measured `authbff` coverage change from prior **51.9%** without claiming the 80% A+ target unless it is actually reached.

## Limits and follow-on

- An optional local destination parameter is no longer honored. Support for returning to `/admin` after OP logout would require storing a validated local path in independent server-side state and consuming it only after successful callback-state verification; it is intentionally not implemented here.
- A 503 global-logout initialization failure means **local logout succeeded but RP-Initiated OP logout was not confirmed**. No automatic re-login, invalid session resurrection or JWT replay is attempted.
- This batch does not prove security of every third-party OIDC provider, cross-store atomic commits, or that a failed OP revocation means the provider's token remained active.
