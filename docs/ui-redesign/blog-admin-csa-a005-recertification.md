# Blog Admin CSA-A005 Consumer Recertification

Status: **verified**

Date: 2026-09-28

## Scope

CSA-A005 corrects the Blog Admin AI Settings Model Connection contract by separating provider vendor identity from wire protocol. This recertification closes the staged cross-repository handshake for the affected `blog-admin-ai-settings` scope.

## Blog Product review

The exact reviewed Product head remains:

`ec92d2748f186b0831cce6f78df913d1676506cf`

That implementation merged through Blog PR #295 as merge commit:

`6cb74fed407611cd1e7efee262d0d804d251495b`

Manual review confirmed:

- Provider vendor and wire protocol are independent concepts.
- Provider cards render user-facing vendor/protocol labels rather than internal enum values.
- Provider create/edit keeps the existing privileged settings ownership and real credential lifecycle.
- Mainstream vendor identities remain product-local data rather than a new Core abstraction.
- Existing Connector OAuth/credential/Outbox behavior is intentionally outside the CSA-A005 Provider correction.
- Existing Agent/Workflow run evidence remains intentional Product behavior.
- The final visual review caught and corrected the raw-enum Provider card drift before the Product implementation was accepted.

## Exact-head Blog evidence

All required Product gates passed on the reviewed head:

- CI `36404210434` — **success**
- Blog Showcase Parity `36404210431` — **success**
- UI Browser Acceptance `36404210415` — **success**
- Images `36404210362` — **success**
- Gosso Release BFF Compatibility `36404210429` — **success**

Retained evidence:

- Showcase parity artifact `10962245898`
  - SHA-256 `fbde8c8b10e616aad5e4d92efd9da86b63d3f32c786bbcb28268dce61367b004`
- Browser acceptance artifact `10961722110`
  - SHA-256 `c5fad0ed2fef0e9ae5da0b1e6dcdd0ccf406436b2ad026c140c6c8b7ee640e26`

The Blog-side staging record was merged through PR #297 at:

`715ff1f74545781f5d01eb32221d2c7a1643bf1c`

## Reciprocal upstream evidence

Gouno UI PR #153 completed the upstream half of the handshake.

Candidate Gouno UI head:

`fb142c7fa8b79f0637df1f521f0cc300311f7250`

Required upstream gates:

- Gouno UI CI `36411763966` — **success**
- Blog Consumer Parity `36411764012` — **success**

The PR merged to Gouno UI main as:

`0545d787e13e09180475c5eeb94fb2bca1b93705`

That merge marks `CSA-A005.consumerImpact["rushairer/gouno-blog"]` as `recertified`.

## Result

The cross-repository state is now consistent:

- Canonical amendment CSA-A005 is accepted.
- Blog Product propagation is merged.
- Fresh Blog manual/browser/parity evidence is retained.
- Reciprocal Gouno UI Blog Consumer Parity passed against Blog main.
- Gouno UI records the Blog consumer as `recertified`.
- Blog may therefore promote `blog-admin-ai` from `needs-manual-recertification` to `verified`.

This status closes only CSA-A005. It does not weaken future post-freeze amendment rules or treat CI alone as design evidence.
