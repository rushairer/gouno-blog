# AI Operations run-detail lifecycle review

Status: **needs-manual-recertification**

## Source-first scope

Reviewed Product base: `936a81691505835c758a1d35cca9ab933ddd77a1`; `AIOperations.tsx` blob `910cf2b3b586bad729988daa7086700564824307` and `AgentRunRecords.tsx` blob `65565da5373c52495fa54648aeaf19fdd1da7f9e`. Read the current upstream Operations route/fixture implementation before the change: `showcase/demos/products/blog-admin/ai/operations/index.tsx` blob `0882b924a2017b952992e6a427e3e5f0d0cafdfc`, Operations tree `bfecd1105de19327f6791b5cadf2df0c81a1cb0f`. The consumed `@gouno/ui` version stays 0.4.9.

The observed defect is Product request ownership, not a Canonical visual amendment. Real asynchronous API responses are an intentional Product responsibility beyond the static fixture. The existing page composition, typography, spacing classes, action grammar, feedback components and responsive markup are not redesigned.

## Baseline visual inspection and limits

Downloaded #381 paired Showcase artifact 12421440495 (SHA256 `b655e29fb9d93d5be43465ea1145ba12badd9c370d75de85fe3e844b07058d6f`). Manually inspected the desktop Operations and mobile Agent-run detail top viewports before attaching the production fix. The master/detail hierarchy, selected row and mobile back-to-list affordance remain coherent. Different real run counts, longer evidence and Product-only delete actions are not grounds for copying fixture data or removing business behavior.

This was a bounded baseline comparison, not a fresh whole-family certification. It does not cover every full-height state, AI Settings, all themes or the changed request lifecycle. The prior artifact remains historical.

## Required post-change evidence

1. The actual Product page must pass controlled stale-success/error, URL-selection, navigation, retry and StrictMode regressions.
2. Run full Browser Acceptance and paired Showcase checks on the final candidate; inspect the exact-head report/artifacts, including record detail and responsive states.
3. Re-read the final diff and compare affected rendered states manually. Record the reviewed refs, actual state coverage and remaining limitations before promoting the AI certification.

Until that review is complete, `blog-admin-ai` remains `needs-manual-recertification`. Other ledger entries and their evidence are unchanged. Green automation alone does not promote this entry. This state is evidence honesty, not a bypass of tests or an overall A+ acceptance.
