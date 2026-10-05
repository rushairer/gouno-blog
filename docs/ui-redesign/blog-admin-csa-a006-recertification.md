# Blog Admin CSA-A006 Consumer Recertification

Status: **verified**

Date: 2026-10-05

## Scope

CSA-A006 extends the canonical `blog-admin-ai-settings` surface with API Access management for server-to-server, read-only Blog Capability export.

This record closes the complete cross-repository amendment handshake after Product reverse migration, manual-first review, exact-head Product evidence, upstream reciprocal parity, and upstream `recertified` state have all landed.

## Blog Product review

The exact reviewed Product head is:

`0a74d106bb60cc21b15acba76437d9f4dacdaa8f`

The implementation merged through Blog PR #303 as:

`504caf623940ee3cab3fd18f3a95f8b32d6f7e07`

Manual review confirmed:

- API Access is a peer AI Settings tab and remains separate from outbound Sandbox Connectors.
- Sudo/recent-MFA ownership protects Client and long-lived API Key mutations.
- API Clients, grantable read-only Capabilities, and invocation audit remain distinct information layers.
- The invocation contract exposes the real server-to-server catalog/invoke endpoints, Bearer authorization shape, and browser-CORS boundary.
- Client create/edit uses the canonical contextual Drawer/editor-form composition for identity, enabled state, rate limit, optional expiry, and explicit Capability allowlist.
- Create/rotate returns a one-time API Key state; plaintext credentials are not durably persisted.
- Revocation requires a destructive confirmation and immediately invalidates the current key.
- Loading, empty, recoverable error, live timestamps, API errors, and real audit rows are intentional Product states beyond the static Fixture.
- Long identifiers and endpoint paths retain semantic mono/body typography and wrapping.
- Browser test selector ambiguities discovered during acceptance were corrected without changing Product semantics.
- No unresolved composition, typography, spacing, feedback, interaction, responsive, or privileged-boundary drift remains.

## Exact-head Blog evidence

All required Product gates passed on `0a74d106bb60cc21b15acba76437d9f4dacdaa8f`:

- CI `37304332154` — **success**.
- Blog Showcase Parity `37304332103` — **success**.
- UI Browser Acceptance `37304332030` — **success**.
- Images `37304331937` — **success**.

Retained Blog evidence:

- Showcase parity artifact `11342544288`
  - SHA-256 `91a105717f396f6bb4c189a0469ac84859e9fdc9d443226fac4e1abfdeb1b398`
- Browser acceptance artifact `11342698521`
  - SHA-256 `80bb808584a917244fce1408af0439c6b6b30b602fdc79dc2c4742b4d305880d`

Blog PR #304 then merged the pending staging evidence to main as:

`f8e1cc036eac8acc4cd60859643e639e440a5ad1`

That staging intentionally retained `needs-manual-recertification` until the reciprocal upstream step completed.

## Reciprocal upstream evidence

Gouno UI PR #155 completed the upstream half of the CSA-A006 handshake.

Final candidate Gouno UI head:

`18a22580b8cd69695906a20e29355fc6ff182917`

Required upstream gates:

- Gouno UI CI `37321144395` — **success**.
- Blog Consumer Parity `37321144321` — **success** against current merged Blog main.

Retained reciprocal artifact:

- `11350421876` — `gouno-ui-blog-consumer-parity-37321144321`
  - SHA-256 `b9b0054447c0fc25d3c3c9f83f288485db675e7e1f595beb9a59ab6cb07e1a03`

Gouno UI PR #155 merged to main as:

`2871993d1d10adce8b26d8d0d75fdc1c519e88bb`

That merge records:

`CSA-A006.consumerImpact["rushairer/gouno-blog"] = "recertified"`

## Result

CSA-A006 is fully recertified:

- the Canonical API Access extension is accepted;
- the real Blog Product implementation is merged;
- fresh Blog manual/browser/parity evidence is retained;
- the pending Blog staging record landed before upstream promotion;
- reciprocal Gouno UI Blog Consumer Parity passed against merged Blog main;
- Gouno UI main records the Blog consumer as `recertified`.

The local `blog-admin-ai` certification may therefore return to **verified**.
