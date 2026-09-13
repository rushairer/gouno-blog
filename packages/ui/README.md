# Historical local UI prior art

`packages/ui` is retained only as historical implementation prior art from the Blog/Gosso UI migration. It is **not** the canonical Gouno design system and is no longer distributed to product frontends.

The single canonical owner is [`rushairer/gouno-ui`](https://github.com/rushairer/gouno-ui). `blog-frontend` consumes an exact immutable npm registry release as `@gouno/ui` and imports product-agnostic primitives from the governed `@gouno/ui/core`, `@gouno/ui/theme`, `@gouno/ui/patterns`, and `@gouno/ui/gouno` entrypoints.

Do not publish, vendor, alias, or reintroduce this local tree as `@gouno/ui-legacy`. Historical source, showcase code, and migration examples may remain here for reference, but new component or product work belongs in the canonical `gouno-ui` repository.

For active Blog frontend integration, import Tailwind once in the consuming app, then `@gouno/ui/tokens.css` and `@gouno/ui/base.css`; explicitly register `node_modules/@gouno/ui/dist` with `@source`. Canonical artifact synchronization is owned solely by `.github/workflows/sync-gouno-ui.yml`.
