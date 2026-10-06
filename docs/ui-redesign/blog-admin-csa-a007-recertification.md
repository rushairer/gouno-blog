# Blog Admin CSA-A007 Consumer Recertification Staging

Status: **needs-manual-recertification**

Date: 2026-10-06

## Trigger

Gouno UI CSA-A007 corrects the frozen `blog-admin-ai-settings` Sandbox Connector Canonical model so it matches the real Product Profile / credential / Outbox contract.

The accepted Canonical code ref is:

`5a7689a14348581444e6123dd309a6c2021da7dd`

The amendment is registered on reviewed Gouno UI main ref:

`6bc3d7dae217b9e398c9f0cd6c46375ae737e778`

Blog Product propagation and evidence hardening merged through PR #307 as:

`71b831ef3790a20d9f346e6caf11c3fbbeeb963a`

The exact reviewed Product head is:

`547e514e6c26f5799e264b53bc0f65c5f4ccf837`

## Manual review

The final A007 review was performed manually before recording this staging state. The review compared the actual Showcase and Product Connector surfaces rather than relying on green automation alone.

Accepted Canonical/Product behavior:

- Connector identity uses the real `kind / enabled / sandbox / config / credential state` model.
- Synthetic `connected/degraded`, `scope`, and `lastChecked` state is no longer part of the Canonical contract.
- Four Connector kinds are represented: Search Console, Newsletter, Social, and Webhook.
- Search Console may use read-only Google OAuth; Newsletter, Social, and Webhook remain Sandbox Mock only.
- Connector enabled and Search Console Sandbox state use canonical Switch semantics.
- Product Drawer uses `Profile 名称` required-field semantics and semantic mono typography for JSON configuration.
- Real Product credential wording remains Product-owned and is not replaced by Fixture-only language.
- Outbox queue input explicitly exposes Profile, idempotency key, and Payload JSON.
- Queue eligibility remains real Product behavior: enabled + Sandbox + credential.
- Outbox rows expose approval, mock-delivery, retry/revoke state, error text, and the real `attempts` value.
- Retry preserves the backend transition `failed -> approved`.
- Paired e2e fixtures use the same Connector/Profile/Outbox scenario set so screenshots measure composition and interaction fidelity rather than fixture-name noise.
- Dedicated Outbox locator screenshots avoid AppShell scroll artifacts and preserve reviewable evidence for the complete queue/status contract.

The manual review also rejected earlier green candidates when the paired screenshots did not actually expose the complete Outbox form. This staging record therefore represents the post-correction evidence, not the first automated-green state.

## Exact-head Blog evidence

All required Product gates passed on exact head `547e514e6c26f5799e264b53bc0f65c5f4ccf837`:

- CI run `37438126060`: **success**.
- Images run `37438126077`: **success**.
- Blog Showcase Parity run `37438125889`: **success**.
- UI Browser Acceptance run `37438126076`: **success**.

Retained Product artifacts:

- Paired Showcase parity artifact `11399943359`, `sha256:51d2d4355081b7e76438c064d9348f4cf65a9c6c0fdf6c9c3452c3aed8e24d13`.
- Browser acceptance artifact `11400641062`, `sha256:a8dcae5ecb8083984066336fef380d50c814d11837401e0ecdb382d645e36874`.

## Upstream pending-ledger evidence

Gouno UI PR #158 registered CSA-A007 in the post-freeze ledger while deliberately keeping Blog consumer impact pending.

Its exact head `e46e140f18213ddca90034e79b2be3b07599301c` passed:

- Gouno UI CI run `37440976392`: **success**.
- Blog Consumer Parity run `37440976238`: **success** against the corrected Blog main.

Retained reciprocal artifact:

- `11401013734` — `gouno-ui-blog-consumer-parity-37440976238`, `sha256:5ecc4f5bc5d8777ad23855143e404a161cab1220dbe195255f37429c377ca02c`.

PR #158 merged the pending A007 ledger to Gouno UI main as:

`6bc3d7dae217b9e398c9f0cd6c46375ae737e778`

## Why status remains pending

This document intentionally keeps Blog local status at `needs-manual-recertification`.

The remaining handshake order is:

1. This fresh Blog manual-review staging record lands on Blog main.
2. Gouno UI marks CSA-A007 `consumerImpact["rushairer/gouno-blog"]` as `recertified`.
3. The upstream recertification candidate passes Blog Consumer Parity against the merged Blog main carrying this reviewed ref.
4. Only after that upstream `recertified` state lands may Blog promote `blog-admin-ai` back to `verified`.

This document completes the fresh Product/manual-review prerequisite only. It does not claim the upstream reciprocal handshake has completed.
