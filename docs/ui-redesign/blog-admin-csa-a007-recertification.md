# Blog Admin CSA-A007 Consumer Recertification

Status: **verified**

Date: 2026-10-06

## Scope

CSA-A007 corrects the frozen `blog-admin-ai-settings` Sandbox Connector surface so Canonical and the real Blog Product share the same Connector Profile, credential and Outbox contract.

This record closes the complete cross-repository amendment handshake after Canonical correction, Product reverse migration, manual-first review, exact-head Product evidence, pending-ledger staging, reciprocal upstream parity, and the upstream `recertified` state have all landed.

## Accepted Canonical correction

The accepted A007 Canonical code ref is:

`5a7689a14348581444e6123dd309a6c2021da7dd`

Gouno UI PR #156 merged that correction as:

`1003c024a2a9c1711230e443782ae090f6b29c49`

CSA-A007 is registered on the frozen post-freeze amendment ledger as a `canonical-correction` scoped only to `blog-admin-ai-settings`.

The correction establishes:

- Connector identity as `kind / enabled / sandbox / config / credential state`;
- removal of synthetic `connected/degraded`, `scope`, and `lastChecked` state;
- Search Console read-only OAuth plus Newsletter/Social/Webhook Sandbox-only boundaries;
- explicit Outbox Profile, idempotency key, and Payload JSON queue input;
- real queue eligibility: enabled + Sandbox + credential;
- Outbox `payload`, `attempts`, approval, mock delivery, retry/revoke and `failed -> approved` retry semantics.

## Blog Product review

The exact reviewed Product head is:

`547e514e6c26f5799e264b53bc0f65c5f4ccf837`

Blog PR #307 merged the reviewed Product/evidence correction as:

`71b831ef3790a20d9f346e6caf11c3fbbeeb963a`

Manual review confirmed:

- the same four Connector Profiles and kind / Sandbox-or-read-only-OAuth / enabled / credential states are represented;
- Connector enabled and Search Console Sandbox state use canonical Switch semantics;
- Product Drawer uses `Profile 名称` required-field semantics and semantic mono typography;
- non-Search-Console kinds explicitly retain the Sandbox-only/no-real-external-write boundary;
- Product credential text remains real-Product wording instead of copying Fixture-only language;
- the Outbox Card exposes Profile, idempotency key, Payload JSON, approval/delivery/retry/revoke actions, errors and attempts;
- paired e2e fixtures use the same Connector/Profile/Outbox scenario set so visual review is not polluted by fixture-name drift;
- dedicated Outbox locator screenshots avoid AppShell sticky-scroll artifacts and preserve the full queue/status contract;
- earlier automated-green candidates were deliberately rejected when the paired evidence did not actually expose the whole Outbox flow.

No unresolved Connector composition, typography, spacing, feedback, interaction or responsive drift remains in the reviewed A007 scope.

## Exact-head Blog evidence

All required Product gates passed on exact head `547e514e6c26f5799e264b53bc0f65c5f4ccf837`:

- CI `37438126060` — **success**.
- Images `37438126077` — **success**.
- Blog Showcase Parity `37438125889` — **success**.
- UI Browser Acceptance `37438126076` — **success**.

Retained Blog evidence:

- Showcase parity artifact `11399943359`
  - SHA-256 `51d2d4355081b7e76438c064d9348f4cf65a9c6c0fdf6c9c3452c3aed8e24d13`
- Browser acceptance artifact `11400641062`
  - SHA-256 `a8dcae5ecb8083984066336fef380d50c814d11837401e0ecdb382d645e36874`

## Pending staging

Blog PR #308 merged the fresh manual-review staging to main as:

`48077a43c006af64abffec087f4850bdd26620b9`

That staging intentionally kept `blog-admin-ai = needs-manual-recertification` and recorded:

- reviewed Blog ref `547e514e6c26f5799e264b53bc0f65c5f4ccf837`;
- reviewed Gouno UI pending-ledger ref `6bc3d7dae217b9e398c9f0cd6c46375ae737e778`;
- exact-head Blog Product evidence;
- the successful pending-ledger reciprocal parity from Gouno UI PR #158.

## Reciprocal upstream evidence

Gouno UI PR #159 completed the upstream half of the final A007 handshake.

Final candidate Gouno UI head:

`dd81061166d007ef1d055bd9c1f1ff1f58ad59d4`

Required upstream gates:

- Gouno UI CI `37441697444` — **success**.
- Blog Consumer Parity `37441697599` — **success** against Blog main carrying the fresh A007 staging record.

Retained reciprocal artifact:

- `11402376851` — `gouno-ui-blog-consumer-parity-37441697599`
  - SHA-256 `f360c72a2210080616cc7039b21f6a88ac82dc33a7cd11bf90174b6021edbc3a`

Gouno UI PR #159 merged to main as:

`2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`

That merge records:

`CSA-A007.consumerImpact["rushairer/gouno-blog"] = "recertified"`

## Result

CSA-A007 is fully recertified:

- the Canonical Connector correction is accepted and registered;
- the real Blog Product is aligned and merged;
- fresh manual/browser/paired evidence is retained;
- Blog staging landed before upstream promotion;
- reciprocal Blog Consumer Parity passed against the staged Blog main;
- Gouno UI main records the Blog consumer as `recertified`.

The local `blog-admin-ai` certification may therefore return to **verified**.
