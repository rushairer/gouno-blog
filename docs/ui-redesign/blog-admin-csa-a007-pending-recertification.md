# Blog Admin CSA-A007 Consumer Recertification Pending

Status: **needs-manual-recertification**

Date: 2026-10-06

## Trigger

Gouno UI PR #156 corrects the frozen `blog-admin-ai-settings` Connector Showcase so its Canonical Fixture and interaction model match the already-shipped Blog Product contract.

The correction candidate is currently reviewed at Gouno UI head:

`df981222b56749a61d2950275eecd59e3ab83f27`

This candidate removes synthetic Connector state that does not exist in the real Product and aligns the Canonical surface with the current Blog Connector model.

## Why certification is reopened before Canonical merge

The current Blog certification was verified against Gouno UI main:

`2871993d1d10adce8b26d8d0d75fdc1c519e88bb`

PR #156 changes files inside the owned Canonical path `showcase/demos/products/blog-admin/ai/settings/`. Manual-first governance therefore requires the Blog consumer certification to reopen before the candidate may pass reciprocal Blog Consumer Parity.

This is a certification-state transition only. It does not assert that the Blog Product is wrong or requires an implementation change.

## Candidate correction scope

The candidate aligns Canonical Connector semantics to the real Blog Product:

- Connector Profile identity is `kind / enabled / sandbox / config / credential state`.
- The retired synthetic fields `connected/degraded`, `scope`, and `lastChecked` are removed from the Canonical Fixture.
- All four real Connector kinds are represented: Search Console, Newsletter, Social, and Webhook.
- Search Console may represent read-only Google OAuth; the other current Connector kinds remain Sandbox Mock.
- Masked credential state uses the real Product concept instead of a fabricated connection-health state.
- Outbox records carry the real `payload`, `attempts`, and approval/delivery/retry/revoke status model.
- Retry follows the real backend transition `failed -> approved`.
- Queue eligibility mirrors the backend guard: Connector must be enabled, Sandbox, and have a credential.
- The candidate does not reopen Provider vendor/protocol semantics from CSA-A005.
- The candidate does not modify API Access semantics from CSA-A006.

## Current Product source of truth

The current Blog Product already uses the corrected contract:

- `blog-frontend/src/types/agent.ts` defines Connector Profile fields `kind`, `sandbox`, `enabled`, `config`, masked credential metadata, plus Outbox `payload` and `attempts`.
- `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` renders enabled state, Sandbox/read-only OAuth mode, masked credentials, JSON configuration, and the approval-gated Outbox.
- The backend Connector service rejects queue attempts unless the profile is enabled, Sandbox, and credentialed.
- Backend retry semantics move a failed Outbox item back to `approved`.

The direction of correction is therefore Canonical -> existing Product truth, not Product -> a newly invented Showcase behavior.

## Pending state

The local `blog-admin-ai` certification must remain `needs-manual-recertification` until:

1. the Gouno UI Connector correction passes its exact-head CI / Canonical visual / reciprocal consumer gates and is accepted;
2. the correction is registered as the next post-freeze Canonical amendment;
3. Blog performs a fresh manual-first review against that accepted Canonical ref and retains fresh parity evidence;
4. Gouno UI completes the reciprocal consumer recertification handshake.

Only after those steps may Blog return `blog-admin-ai` to `verified`.
