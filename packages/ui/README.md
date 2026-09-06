# @gouno/ui

The single source of Gouno's React UI, semantic design tokens and administration template. No authentication, API or application state is imported here.

Build with `npm ci && npm run build`. From the Blog root run `node scripts/ui/distribute.mjs blog-frontend ../gosso-admin/gosso-admin-frontend`, then install each frontend. The generated archives are immutable consumer artifacts, not editable component forks. Both consumers must commit identical version/integrity manifests. React is a peer dependency.

Run `npm run showcase:dev` for the standalone component and page-template showcase, or `npm run showcase:build` for its production bundle. The showcase provides a unified Blog, Blog Admin and Gosso Admin shell with deterministic static fixtures, switchable loading/empty/error/permission states, responsive list/editor/account templates, theme and brand controls, and an interactive table-density comparison. It never authenticates, reads cookies, calls APIs, or changes application state.

Tables expose `default`, `compact`, and `touch` density through `Table` and `DataTable`. Use `default` for ordinary administration lists, `compact` for dense audit data, and `touch` when row targets need extra space. Consumers should use the shared density rather than page-local padding overrides.

The showcase also includes a hash-addressable `状态与弹层` page covering shared Dialog, Drawer, ConfirmDialog, Toast, form-error, and Step-Up presentation. For example, open `/#overlays` during local development to review the interaction contract without connecting an application service.

The compact 48px global workbench uses a distinct semantic sidebar surface and exposes only `产品空间` and `预览宽度`. Every mode renders the selected workspace in one same-origin iframe: full width fills the available canvas, while the fixed options provide real 1024×768, 768×1024, or 390×844 content viewports. This triggers the same media queries as the consuming applications. Use the URL printed by Vite because it will select another port when 5173 is already occupied.

The `产品空间` selector keeps information architecture separate from visual brand tokens: Gouno UI owns Foundations and overlay contracts, while Blog, Blog Admin, and Gosso Admin each own their product pages. Navigation and light/dark/system controls live only inside the iframe shell. Gouno UI also exposes a theme-color preview for the three product token sets; product workspaces always use their fixed brand. Iframe navigation is synchronized to the workbench so changing viewport preserves the current page.

Import Tailwind once in the consuming app, then `@gouno/ui/tokens.css` and `@gouno/ui/base.css`; explicitly register `node_modules/@gouno/ui/dist` with `@source`. Wrap the complete app (including error and auth boundaries) in `ThemeProvider`; supply its origin-local storage key and brand. Install the exported bootstrap as a parser-blocking, same-origin script before application CSS. A router adapter provides `Link` through `NavigationProvider`.

`AdminShell` accepts navigation, branding, breadcrumbs, toolbar, account and footer slots. The caller filters navigation permissions and implements all operations. Shared components must not query services, change session state or invent unavailable actions.

Themes: light/dark/system, default system. Brands: Blog (blue), Blog Admin (teal), Gosso Admin (violet). Status colors are invariant. Use semantic utilities only; concrete colors belong in tokens.css. Fonts ship locally with licenses. Inter UI, 14px; reading 18px/1.8; 4px spacing unit; 6px controls; 10px panels; 36px desktop and at least 44px touch targets.
