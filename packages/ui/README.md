# @gouno/ui

The single source of Gouno's React UI, semantic design tokens and administration template. No authentication, API or application state is imported here.

Build with `npm ci && npm run build`. From the Blog root run `node scripts/ui/distribute.mjs blog-frontend ../gosso-admin/gosso-admin-frontend`, then install each frontend. The generated archives are immutable consumer artifacts, not editable component forks. Both consumers must commit identical version/integrity manifests. React is a peer dependency.

Run `npm run showcase:dev` for the standalone component and page-template showcase, or `npm run showcase:build` for its production bundle. The showcase provides a unified Blog, Blog Admin and Gosso Admin shell with deterministic static fixtures, switchable loading/empty/error/permission states, responsive list/editor/account templates, theme and brand controls, and an interactive table-density comparison. It never authenticates, reads cookies, calls APIs, or changes application state.

Tables expose `default`, `compact`, and `touch` density through `Table` and `DataTable`. Use `default` for ordinary administration lists, `compact` for dense audit data, and `touch` when row targets need extra space. Consumers should use the shared density rather than page-local padding overrides.

The showcase also includes a hash-addressable `状态与弹层` page covering shared Dialog, Drawer, ConfirmDialog, Toast, form-error, and Step-Up presentation. For example, open `/#overlays` during local development to review the interaction contract without connecting an application service.

The toolbar's `预览宽度` control constrains the workspace to full width, 1024px desktop, 768px tablet, or 390px mobile so responsive states can be reviewed without resizing the browser.

Import Tailwind once in the consuming app, then `@gouno/ui/tokens.css` and `@gouno/ui/base.css`; explicitly register `node_modules/@gouno/ui/dist` with `@source`. Wrap the complete app (including error and auth boundaries) in `ThemeProvider`; supply its origin-local storage key and brand. Install the exported bootstrap as a parser-blocking, same-origin script before application CSS. A router adapter provides `Link` through `NavigationProvider`.

`AdminShell` accepts navigation, branding, breadcrumbs, toolbar, account and footer slots. The caller filters navigation permissions and implements all operations. Shared components must not query services, change session state or invent unavailable actions.

Themes: light/dark/system, default system. Brands: Blog (blue), Blog Admin (teal), Gosso Admin (violet). Status colors are invariant. Use semantic utilities only; concrete colors belong in tokens.css. Fonts ship locally with licenses. Inter UI, 14px; reading 18px/1.8; 4px spacing unit; 6px controls; 10px panels; 36px desktop and at least 44px touch targets.
