# Frontend initial-entry bundle budget and public route splitting — 2026-10-15

Tracked under [A+ quality issue #359](https://github.com/rushairer/gouno-blog/issues/359). Exact source base is `main` `1cd42f7945d1943acc58732944b7125b9305948f`, after approved Article/Page security repair [#366](https://github.com/rushairer/gouno-blog/pull/366). This is a **performance and navigation-boundary** change, not an approval to redesign certified Blog UI pages or change their content.

## Measured baseline and root

Before this change, the accepted [frontend CI #38708781407](https://github.com/rushairer/gouno-blog/actions/runs/38708781407) emitted `dist/assets/index-CvGU8lvI.js` at **856.51 kB minified / 268.40 kB gzip** and showed Vite's standard **500 kB** chunk warning. The build already split AI and Admin pages via `React.lazy`, but `src/App.tsx` still imported nine unrelated public destinations **statically** (Home, ArticleIndex, PostDetail, Categories, Tags, Archive, About, NotFound and CustomPageView). That loads public Markdown/article/search components and data for users who might only need a different route. It also increases unnecessary download/parse/execute cost for confidential admin entrypoints.

The 74 Oxlint warnings in the previous baseline are **an independent quality debt**. They are not solved by this change, and no intentional unrelated React Hook or frozen Connector code is modified here.

## Implementation: meaningful split, not a warning suppression

- Replace those nine eager `App.tsx` page imports with `React.lazy(() => import("./pages/<Name>"))`. Keep every existing URL, component, public page prop and authorization guard unchanged. Already lazy Admin/Account routes remain unchanged.
- Reuse the already-present `Public` wrapper's `<React.Suspense>` spinner inside the persistent `PublicShell` on route-chunk loading. Do not invent new Product-local skeleton styles; this change does not alter the canonical Gouno UI design system, Showcase fixtures, certified page component files, BFF cookies, OAuth identity, Provider calls or permissions.
- `scripts/check-bundle-chunk-budget.mjs` checks **every** emitted `dist/assets/*.js` chunk with filesystem `stat` and fails the build at **more than 500,000 bytes**. The existing Vite warning threshold is **not increased**, and moving a large blob into a `vendor` chunk cannot fake success. A missing/dist-less build also fails, instead of silently passing.
- Integrate the check after `vite build` and the existing no-static-cycles checker in `package.json`'s existing `npm run build`. `package-lock.json` and runtime dependency versions are unchanged. The check runs in all existing `quality` / image-build CI jobs.
- `src/utils/__tests__/public-route-chunk-budget.test.ts` verifies all nine exact lazy-import contracts, preserves PublicShell+spinner and admin/identity routes, and tests the checker in isolated temp directories against **missing build**, **exact 500 kB accepted**, and **oversize vendor chunk rejected**.

## Mandatory final-head acceptance

1. Measure the **actual emitted index size** and maximum JS chunk from the final `npm run build` log, not from old estimates or a Vite reporter badge. Record the new per-chunk budget checker output and quantify size reduction against 856.51 kB. No increased `chunkSizeWarningLimit`, no security lint suppressions. If any chunk exceeds 500 kB, the PR fails until actual dynamic boundaries are corrected.
2. `npm run quality`, frontend full typecheck/unit/coverage/UI/CSS/source contracts and React testing (including lazy navigation). Inspect the remaining Oxlint warning count without treating it as an accepted waiver.
3. Because the change is in `blog-frontend/**`, the strict **Blog Showcase Parity** PR workflow must **actually run** (upstream canonical/source and browser paired style comparisons). Preserve the existing manually certified pages and do **not** mark their visual certification based only on green CI; route-loading behavior needs explicit human browser follow-up where not directly exercised.
4. Full backend Go 1.27.2 test/race/vet/mod verify/govulncheck, Seed, production Compose and dependency review, **disposable real PostgreSQL 115 required tests** with zero skipped/failed/missing and all 3 false-green probes, backend/frontend/Seed multiarch image builds plus all six Trivy/Grype scans, and Gosso BFF compatibility on exact final PR head. Download actual database artifact and check its hash.
5. Merge only after all gates match that exact SHA and no newer main conflict. Track changes in #359. Never call this a project-wide A+ release certification.

## Explicitly remaining

The frontend **74 React/oxlint warnings**, many in manually certified Product pages and three warnings in the frozen Connector UI, are not changed by this route-splitting phase. Classify and resolve them by carefully reviewed Page/Pattern batches with canonical design reasoning before modifying certified Product-owned source. The #338 external provider billing/recovery/operator signoff, indirect Controller/middleware leaks and final independently verified release threat model remain open.
