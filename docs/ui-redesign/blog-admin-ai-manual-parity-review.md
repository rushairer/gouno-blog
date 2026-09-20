# Blog Admin AI Manual Showcase Parity Review

Status: **verified — manual review, paired Showcase rendered parity, full browser acceptance, CI and image builds passed**

Date: 2026-09-20

This review exists because source markers and green CI are not sufficient proof of
visual parity. The order for AI parity work is now:

1. read the current Gouno UI Showcase implementation;
2. read the real Blog Admin implementation;
3. compare visible states and composition by hand;
4. classify each difference as intentional product behavior or UI drift;
5. fix confirmed drift;
6. re-review the changed source;
7. only then encode stable conclusions into source/browser contracts;
8. mark migration evidence verified only after paired browser acceptance passes.

## AI Settings

| Surface | Manual finding | Decision |
| --- | --- | --- |
| Agents list | Collection anatomy matched, but the local panel lead and row spacing had drifted. | Reuse shared canonical TabPanelLead; restore canonical row rhythm and feedback boundary. |
| Agent editor | Dedicated Editor structure existed, but typography still contained local token drift. | Keep real API fields and validation; align shared Dedicated Editor layout/sections/actions and typography. |
| Skills list | Collection and action grammar match Showcase after shared lead adoption. | Preserve real import/export/copy behavior; no cosmetic-only rewrite. |
| Skill editor | Dedicated Editor grammar is required; business fields may exceed Fixture data. | Keep real governance fields; preserve canonical section/layout/action grammar. |
| Tools | Tab lead collapsed because Blog had a private copy without the Showcase minimum-height contract; Tool names also used raw Tailwind typography. Final paired screenshot review also found that real `read / propose / write` risk values were all rendered with the default gray tag. | Shared TabPanelLead owns the 36px minimum lead height; Tool names use canonical mono/body tokens. Preserve the real risk labels, but map `read → success`, `propose → warning`, `write → error` so the product follows the Showcase risk-color grammar without changing backend semantics. |
| Knowledge | The old surface exposed infrastructure health only: counters plus Embedding profiles, so users could not tell what content was indexed or inspect actual retrieval evidence. | Preserve canonical order `TabPanelLead → Feedback → 索引概览 → 已索引内容 → 检索验证 → Embedding 配置`; bind real index-content and retrieval APIs, keep Citation/Semantic/Lexical evidence visible, and retain real retry/rebuild + Recent-MFA behavior. |
| Model connections | Default-purpose heading used local text sizing. | Use the canonical compact Heading; keep Recent-MFA gate and real import/export/test behavior. |
| Provider drawer | Contextual Drawer is the correct task surface. | Keep real provider protocol fields; Drawer owns identity and submit boundary. |
| Embedding drawer | Contextual Drawer is the correct task surface. | Keep real endpoint/key/timeout fields; preserve canonical two-column form grammar. |
| Connectors | Connector collection had a private lead and an extra “Connector Profiles” header layer. | Reuse shared lead, remove redundant collection header, align row/action grammar. |
| Connector OAuth / Outbox | Real Blog must collect Profile, idempotency key and payload; Showcase Fixture can queue with one click. | **Intentional product divergence.** Keep the real input flow, but align secondary section heading, card, feedback and item/action grammar. |
| Connector drawer | Contextual Drawer matches the Showcase task surface. | Preserve OAuth/credential behavior; align editor section grammar only. |

## AI Operations

| Surface | Manual finding | Decision |
| --- | --- | --- |
| Overview | Active-tab meaning was previously repeated as an extra panel title. | Keep only the canonical TabPanelLead description/actions; shared lead owns height and rhythm. |
| Decision Inbox | Master/detail marker existed, but geometry, rail header and meta/signal anatomy differed. | Restore canonical min-height, column ratio, header typography and object-row information grammar; keep Refresh and real mutation behavior. |
| Automation list | List/detail transition existed, but active-tab meaning was repeated and list/detail composition had drift. | Keep list → dedicated detail; restore canonical panel lead and shared list grammar. |
| Workflow editor | Editing is a Dedicated Editor task, not inline list content. | Preserve real planner/schema/resource-query behavior inside the canonical Dedicated Editor shell. |
| Workflow detail | Blog had replaced canonical metric cards + schedule fact row with a generic summary strip and hand-written heading typography. | Restore metric cards, fact row, Heading variant, icon geometry and action grammar; keep real metrics/data. |
| Recent Runs | Five-column anatomy is canonical and remains appropriate for real data. | Preserve real routing and run data while keeping Showcase geometry. |
| Run Center / Workflow | Rail rows were hand-written Button markup while Agent rows used the shared object-row pattern. | Use OperationsObjectRow for both rails; keep loading/selection behavior. |
| Run Center / Agent | Shared rail geometry existed; heading typography had local drift. | Align rail/header and detail heading tokens; retain real AI output/evidence sections. |
| Workflow Run detail | Blog grouped execution on the left and all evidence on the right; resources + human interactions were merged into one card. | Restore sequential evidence flow and separate Resource / Human Interaction sections; retain retry, cancel and response JSON behavior. |
| Agent Run evidence extras | Real product contains audit/suggestion/evidence surfaces not represented by the Fixture. | **Intentional product divergence.** Do not delete real evidence merely for visual similarity; use canonical typography/composition where a direct counterpart exists. |

## Shared root causes confirmed

- Multiple page-private copies of the same Showcase-owned composition allowed silent drift.
- Static gates covered selected markers, not the entire visible state.
- Existing migration rows were treated as evidence instead of a record of evidence.
- “Green CI” was over-interpreted as whole-page parity.

## Durable rules extracted after review

- One local shared `TabPanelLead` owns the non-public Showcase pattern used by Blog Admin.
- AI Settings six collection leads must share the canonical minimum-height and anatomy.
- Agent/Skill are Dedicated Editor tasks; Provider/Embedding/Connector are contextual Drawer tasks.
- AI Operations object rails use one shared object-row grammar.
- Workflow detail uses canonical metric-card + fact-row composition.
- Workflow Run evidence follows execution → resources/human-interaction → event/evidence flow.
- Product-only behavior is allowed only when it is explicitly classified as intentional divergence.
- Migration metadata never proves parity. Paired browser evidence is required before final verification.

## Final verification evidence

The AI Settings / AI Operations family was re-certified after the Knowledge Workspace
redesign and reverse migration. The reviewed real-product head is
`29451582d5c812642402d19c16dff3ed535b0ef1`; the reviewed canonical Gouno UI
head is `c64c19f1a045545f54d988609a6ad2e80f2dfe6c`.

The final manual pass re-read both current implementations before updating the
certification ledger. It confirmed:

- the six AI Settings tabs still have the same canonical ownership and order;
- Agent and Skill remain Dedicated Editor tasks;
- Provider, Embedding and Connector remain contextual Drawer tasks;
- Tools retains canonical lead, row typography and risk semantics;
- Knowledge owns its own Workspace while preserving canonical lead, feedback,
  index overview, indexed content, retrieval verification and Embedding layers;
- Provider and Knowledge high-privilege policy copy is owned by the surface that
  renders the corresponding SudoGate;
- Connector keeps the canonical collection/Outbox composition while preserving
  the real read-only OAuth and real-product input differences;
- no product-only behavior was removed merely to satisfy visual parity.

Fresh verification evidence for that reviewed state:

- CI run `35486707395`: **success** — frontend formatting, lint, UI/CSS
  contracts, typecheck, coverage and build; backend quality/race/vulnerability
  gates; seed, integration and compose checks all passed.
- Blog Showcase Parity run `35486707373`: **success** — certification ledger,
  AI Settings source contract, AI Operations source contract and paired rendered
  style comparison all passed.
- Paired Showcase artifact `10597571973`:
  `sha256:77ac5621bd47f21326bb899bfcc52eace9b6c9339aae2c890eaf72faeb521375`.
- UI Browser Acceptance run `35486707428`: **success** — full rendered product
  acceptance passed.
- Browser evidence artifact `10598310684`:
  `sha256:d574cebeae52fdf71bc77f0ab19eea59202a80b87df5d6ae84aab7069a76ed9e`.
- Reciprocal Gouno UI Blog Consumer Parity run `35486806069`: **success** on
  canonical head `c64c19f1a045545f54d988609a6ad2e80f2dfe6c`.
- Reciprocal parity artifact `10597542294`:
  `sha256:5751fe1b628f99f10878e0e2490e175f5c25cb177ee132d1060d1d838829683d`.
- Gouno UI CI `35486806060` and GitHub Pages publish `35486806062` both
  succeeded on the same canonical head.

This evidence records the result; it does not replace the manual reasoning that
preceded the implementation and the contracts.
