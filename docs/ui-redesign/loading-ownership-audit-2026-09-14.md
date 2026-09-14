# Loading Ownership Audit — 2026-09-14

Status: accepted migration input; runtime migration waits for a published `@gouno/ui` release that contains Gouno `PageSkeleton` (PD-076).

## Purpose

This audit separates three different loading responsibilities before any product-side replacement is attempted:

1. application/session/auth/chunk infrastructure loading;
2. initial unresolved product data loading;
3. refresh, filtering, pagination and mutation loading after usable state already exists.

The goal is not to maximize `PageSkeleton` usage. The goal is to give each loading state the narrowest owner that can define its semantics and visual boundary without recreating broad Legacy `AsyncState` or `DataTable` behavior.

## Infrastructure loading

`blog-frontend/src/App.tsx` is already correct and should not be changed merely because Gouno UI now has `PageSkeleton`.

Session restore, auth guards and React lazy-chunk boundaries use lightweight Spinner-based fallbacks. They do not pretend that unresolved JavaScript or authentication state is already a known business page. Keep this behavior.

## Approved PageSkeleton migration candidates

These routes have initial data regions whose anatomy now matches an admitted `PageSkeleton` layout. The stable page chrome around them must remain rendered.

### Dashboard — `layout="dashboard"`

File: `blog-frontend/src/pages/admin/Dashboard.tsx`

Current `DashboardLoading` repeats the admitted dashboard grammar: statistic cards followed by larger read-dominant dashboard regions. `PageHeader` is already stable outside the loading region.

Migration after the package release:

```tsx
<PageSkeleton
  layout="dashboard"
  aria-label="数据概览加载中"
  statistics={4}
  sections={3}
/>
```

Do not move analytics fetching, retry, alerts or mutation state into Gouno UI.

### Posts — `layout="collection"`

File: `blog-frontend/src/pages/admin/Posts.tsx`

The route has stable `PageHeader`, filters and known table schema before rows resolve. The initial collection loading region can migrate to `PageSkeleton` while preserving real column headings through presentation-only column descriptors.

Do not move search/filter query state, pagination state, row selection, batch actions, permissions, WorkflowLauncher behavior or delete lifecycle into `PageSkeleton`.

Filtering or pagination may legitimately enter a transition state because the previous rows no longer represent the newly selected query. Do not mechanically preserve stale rows solely to avoid a structural loader.

### Pages — `layout="collection"`

File: `blog-frontend/src/pages/admin/Pages.tsx`

The route has the same ownership boundary as Posts: route header and filters are stable; row data is unresolved; table headings are already known. Replace only the initial/transition collection placeholder, not page selection, delete semantics, pagination, AI workflow orchestration or responsive business content.

### Users — `layout="collection"`

File: `blog-frontend/src/pages/admin/Users.tsx`

The member directory has stable route structure and known desktop collection headings. Its initial unresolved member collection is a valid `PageSkeleton` collection candidate.

A same-query manual refresh is different from initial loading: if member data is already usable, keep the current directory visible, mark the affected region busy when appropriate, and let the refresh control expose its own loading state. Do not replace resolved members with an initial-loading skeleton during that refresh.

Sudo/MFA gates, ownership transfer, role editing, destructive confirmation and mutation retries remain product-owned.

## Keep product-local

The following surfaces must not be migrated merely because they contain `Skeleton` blocks:

- Site Settings: form/editor plus live login/site preview has product-specific two-region anatomy.
- Comments: moderation queue is a card-oriented workflow, not the admitted generic collection silhouette.
- Media Library: media selection/grid and upload behavior are product-specific.
- Post/Page editors: editor workspaces have their own loading and persistence semantics.
- AI Operations / Agent / Workflow surfaces: lifecycle and execution context are domain-specific.
- Public Home, Article Index, Article Detail and custom reading pages: their reading/discovery silhouettes are intentionally public-product anatomy rather than Gouno admin page anatomy.
- Authentication pages and OAuth callback: auth state machines remain outside `PageSkeleton`.

## Refresh and mutation rule

`PageSkeleton` is an initial unresolved-data presentation policy, not a generic `loading` prop.

- Initial request with no usable data: structural page/region skeleton is appropriate when the layout is admitted.
- Same-query background refresh with usable data: keep the resolved data visible and expose busy state locally.
- Query-changing filter/pagination transition: previous data may be semantically stale; the product may replace the row region with a structural loader if that is clearer than showing mismatched data.
- Save/delete/batch/security mutations: keep unrelated page content visible; use canonical control loading/disabled state and product-owned feedback.
- Fatal initial read error: render the route's error/retry state rather than an `Empty` state.

## Registry boundary

The production application consumes exact immutable npm releases. Do not import unreleased `gouno-ui/main`, vendor PageSkeleton source, or create a local compatibility copy.

The code migration is allowed only after the registry release containing PD-076 is published and the exact `@gouno/ui` version plus lockfile integrity are updated through the normal dependency upgrade path.

## Validation when migration starts

For each migrated route:

1. keep the existing route-level PageHeader/filter/navigation structure stable;
2. replace only the qualifying loading composition;
3. preserve localized accessible loading names;
4. preserve error, empty, retry, selection and mutation behavior;
5. run the existing frontend quality/UI/CSS contract gates and build;
6. run route-focused tests plus browser acceptance where the repository workflow supports it;
7. commit and push in a narrow stage rather than batching unrelated UI cleanup.
