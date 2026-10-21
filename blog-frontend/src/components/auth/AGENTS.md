# Shared authentication UI boundaries

Root `AGENTS.md` remains authoritative. These components present Blog-local BFF/Step-Up state; they do not grant authentication or authorization.

- The global `unhandledrejection` handler is a last-resort feedback boundary, not a trusted domain-error renderer. Unknown failures use a fixed safe message. Never copy arbitrary rejection text, Error messages/causes/stacks, response bodies, URLs or credentials into notifications or new logs.
- Preserve the existing Error/string MFA recognition for the prompt. Do not coerce arbitrary rejection objects, invoke their `toString`, trust message-shaped plain objects, or allow throwing Error getters/proxies to break the handler. Prompt display is not evidence that server-side MFA succeeded.
- Initialize one-shot navigation prompt state with a read-only state initializer. Consume the query flag only after commit; retain the pathname, other query parameters, hash and history state. Keep StrictMode setup/cleanup and post-completion rerenders idempotent.
- Attach each global event listener in an effect and remove the exact listener during cleanup. No error path may automatically replay business operations, reset an AI generation attempt or modify authentication/session contracts.
- Keep real rendered component regressions for fixed error feedback, Error/string MFA prompting, hostile unknown values, StrictMode, navigation preservation, completion and unmount. Do not replace these with source-marker-only checks.
- `StepUpMfaModal.tsx` and `SudoGate.tsx` are certified Product-owned paths. Their changes still require the root manual-first review and Showcase parity process. A shared-boundary fix does not certify all Product pages or all server/client error paths.
