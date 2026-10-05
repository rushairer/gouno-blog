# Blog Admin CSA-A006 Consumer Recertification Staging

Status: **needs-manual-recertification**

Date: 2026-10-05

## Trigger

Gouno UI CSA-A006 extends the frozen `blog-admin-ai-settings` canonical surface with API Access management for server-to-server, read-only Blog Capability export.

The accepted Canonical extension is CSA-A006 commit `cc1962c83c2c82cf59f0b063c9e48096dbf4a3ff`, contained in reviewed Gouno UI main ref `65e087d1b0cc6658f778a8ea31ca7536e520b748`.

Blog Product propagation merged through PR #303 as squash commit `504caf623940ee3cab3fd18f3a95f8b32d6f7e07`. The exact reviewed Product head is `0a74d106bb60cc21b15acba76437d9f4dacdaa8f`.

## Manual review

The Canonical API Access surface and the real Blog Product implementation were re-read directly before recording this staging evidence. Review covered composition, semantic typography, spacing/rhythm ownership, feedback semantics, interaction/action grammar, responsive behavior, privileged access, irreversible actions, credential lifecycle, and real Product states.

Observed and accepted Product behavior:

- API Access is a peer AI Settings tab, separate from outbound Sandbox Connectors.
- The privileged Sudo boundary owns Client/key mutations.
- The management surface keeps the Canonical three-layer information architecture: API Clients, grantable read-only Capabilities, and recent invocation audit.
- The invocation protocol exposes the real server-to-server catalog/invoke endpoints, Bearer authorization shape, and browser-CORS boundary.
- Client create/edit uses the established contextual Drawer and editor-form composition for identity, rate limit, optional expiry, enabled state, and explicit Capability allowlist.
- Creating or rotating a Client returns a one-time API Key state; the full key is not persisted by the Product.
- Revocation requires an explicit destructive confirmation and explains that the current key becomes immediately invalid and cannot be restored.
- Long identifiers and endpoint paths retain semantic mono/body typography and wrapping.
- Product-only loading, empty, recoverable error, real timestamps, API errors, and live audit data are intentional real-product states rather than Canonical drift.
- Browser acceptance exposed two ambiguous Playwright text locators after successful Product behavior; both were corrected to exact-match assertions without changing Product semantics.
- The final manual/source comparison found no remaining UI drift requiring Product source changes.

## Exact-head automated evidence

All required Product gates passed on exact head `0a74d106bb60cc21b15acba76437d9f4dacdaa8f`:

- CI run `37304332154`: **success**.
- Blog Showcase Parity run `37304332103`: **success**.
- UI Browser Acceptance run `37304332030`: **success**.
- Images run `37304331937`: **success**.

Retained artifacts:

- Paired Showcase parity artifact `11342544288`, `sha256:91a105717f396f6bb4c189a0469ac84859e9fdc9d443226fac4e1abfdeb1b398`.
- Browser acceptance artifact `11342698521`, `sha256:80bb808584a917244fce1408af0439c6b6b30b602fdc79dc2c4742b4d305880d`.

## Merge state

PR #303 merged the reviewed Product implementation to Blog `main` as:

`504caf623940ee3cab3fd18f3a95f8b32d6f7e07`

This staging record intentionally keeps the local certification at `needs-manual-recertification`.

## Why status remains pending

The cross-repository amendment handshake requires this order:

1. Blog Product implementation and fresh manual/browser evidence land while the local certification remains `needs-manual-recertification`.
2. Gouno UI marks CSA-A006 `consumerImpact["rushairer/gouno-blog"]` as `recertified` and reciprocal Blog Consumer Parity runs against the merged Blog main implementation.
3. Only after that upstream state lands may Blog promote its local `blog-admin-ai` certification back to `verified`.

This document completes step 1 only. It does not claim reciprocal certification before Gouno UI has validated the merged Blog consumer.
