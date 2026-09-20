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

The implementation state reviewed above was merged from PR #266 after all evidence
below passed on head `42b00d787cc14e6039744d74356343bca0b3e336`.

- Manual paired screenshot review: Tools, Sandbox Connectors and AI Operations / Run Center were visually re-checked after the automated comparison passed. Data-count and real-business differences were not treated as layout drift.
- CI run `35481882455`: **success** — frontend format/lint/UI contracts/typecheck/coverage/build plus backend, seed, integration, dependency and compose gates.
- Images run `35481882453`: **success** — frontend, backend and seed image builds.
- Blog Showcase Parity run `35481882452`: **success** — AI Settings source contract, AI Operations source contract and canonical rendered-style comparison all passed.
- Paired Showcase artifact `10595808968`: `sha256:6420ec85e4e602d24da76788b0bbc30dadf74ff55cac6d83fe61f4868ff273b2`.
- UI Browser Acceptance run `35481882457`: **success** — full rendered acceptance completed.
- Browser evidence artifact `10596108871`: `sha256:5f5a1c111970a5c25a071e42546796ebed6722a57ef69b43698ed57b2528e404`.
- Merge commit: `aea170da25e4499efe77f302f2cce43ad1db60e2`.

This evidence records the result; it does not replace the manual reasoning that
preceded the implementation and the contracts.
