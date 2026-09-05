# @gouno/ui

The single source of Gouno's React UI, semantic design tokens and administration template. No authentication, API or application state is imported here.

Build with `npm ci && npm run build`. From the Blog root run `node scripts/ui/distribute.mjs blog-frontend ../gosso-admin/gosso-admin-frontend`, then install each frontend. The generated archives are immutable consumer artifacts, not editable component forks. Both consumers must commit identical version/integrity manifests. React is a peer dependency.

Run `npm run showcase:dev` for the standalone component showcase, or `npm run showcase:build` for its production bundle. It demonstrates the shared shell, layout, actions, badges, fields, feedback and theme controls without application authentication or API state.

Import Tailwind once in the consuming app, then `@gouno/ui/tokens.css` and `@gouno/ui/base.css`; explicitly register `node_modules/@gouno/ui/dist` with `@source`. Wrap the complete app (including error and auth boundaries) in `ThemeProvider`; supply its origin-local storage key and brand. Install the exported bootstrap as a parser-blocking, same-origin script before application CSS. A router adapter provides `Link` through `NavigationProvider`.

`AdminShell` accepts navigation, branding, breadcrumbs, toolbar, account and footer slots. The caller filters navigation permissions and implements all operations. Shared components must not query services, change session state or invent unavailable actions.

Themes: light/dark/system, default system. Brands: blog (blue), blog-admin (teal), gosso-admin (violet). Status colors are invariant. Use semantic utilities only; concrete colors belong in tokens.css. Fonts ship locally with licenses. Inter UI, 14px; reading 18px/1.8; 4px spacing unit; 6px controls; 10px panels; 36px desktop and at least 44px touch targets.
