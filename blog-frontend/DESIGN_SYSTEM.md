# Gouno Blog Design System

The Blog frontend and `gosso-admin/gosso-admin-frontend` share one interaction and layout contract. Product branding may keep a distinct editorial accent hue, but component geometry, spacing, state semantics, surface depth, and accessibility behavior must remain equivalent to the Gouno UI Showcase.

## Primitive ownership

- Shared controls, tokens, theme behavior, shell patterns, runtime theme bootstrap, and canonical Gouno family brand marks are owned by the published `@gouno/ui` package.
- Product code consumes governed package entrypoints such as `@gouno/ui/core`, `@gouno/ui/patterns`, `@gouno/ui/gouno`, `@gouno/ui/theme`, and `@gouno/ui/brand-icons/*`; it must not recreate package primitives under `src/components/ui` or vendor package assets into `public/`.
- Feature code must use `Button`, `ButtonLink`, `IconButton`, `IconButtonLink`, `Badge`, `Dialog`, `Modal`, `Panel`, `TableContainer`, and shared form controls instead of duplicating their markup.
- `IconButton` and `IconButtonLink` require both `label` and `icon`; the primitive owns the accessible name and fixed icon slot.
- Button icons use the `icon` prop. Do not place SVG children directly inside a text button.
- Legacy size aliases remain accepted for compatibility, but new code uses `sm`, `default`, or `lg`.

## Control matrix

| Size | Height | Text action padding | Icon action |
| --- | ---: | ---: | ---: |
| `sm` | 34px | 12px | 34 x 34px |
| `default` | 38px | 14px | 38 x 38px |
| `lg` | 46px | 18px | 46 x 46px |

Controls use a 6px radius (`--radius-control: 6px`; large controls scale to 8px). Small controls use a 6px icon/label gap; default and large controls use 8px. Icons always render in a fixed 16px, non-shrinking slot.

Canonical action variants are `primary`, `secondary`, `destructive`/`danger`, `ghost`, and `outline`. `default`, `base`, `regular`, and `compact` are compatibility aliases only.

## Badge contract

Badges default to a neutral tone and use an 8px radius, 3px vertical padding, and 8px horizontal padding. Supported semantic tones are `primary`/`brand`, `secondary`/`neutral`, `success`, `warning`, and `destructive`/`danger`. Use `pill` only when a fully rounded capsule is semantically useful.

## Layout rhythm

- Page and panel groups use 24px (`gap-6`) as the default vertical rhythm; dense item groups use 12-16px.
- Cards and panels use 24px internal padding unless a component explicitly owns a flush table or list.
- Form labels sit 6px above their controls. Fields are separated by 16px. Submit/action rows start after 16px.
- Admin content uses responsive horizontal padding capped at 36px.

## Data display

Table cells are vertically centered. Text, icons, badges, and actions that belong together stay on one line. Action columns are right-aligned and use a non-wrapping 8px action group. Icon slots and controls must declare non-shrinking behavior.

Use `TableContainer` for horizontal overflow and shared table rhythm. Do not recreate its scroll wrapper in feature pages.

## Surface and overlay contract

Panels use semantic surface tokens, an 8% text-derived border, a 12px radius, and a restrained elevation shadow. Interactive cards lift by at most 1px. Light and dark themes keep the same hierarchy and only swap token values.

`Dialog` and `Modal` consume the focus-management and overlay behavior provided by `@gouno/ui`; product pages must not import Radix UI directly or reimplement escape/outside-click behavior.

## CSS cascade isolation

- Tailwind is imported exactly once from `src/styles/tailwind.css`, which must be the first CSS entry loaded by `main.tsx`.
- Canonical reset, font faces, semantic tokens, and primitive styling come from `@gouno/ui`; product CSS is feature-scoped only.
- Accessibility overrides that must outrank utilities live in the final `overrides` layer and are loaded last.
- Every source stylesheet must place style rules inside an explicit cascade layer; `npm run lint:css` rejects unlayered top-level rules, `!important`, duplicate Tailwind imports, and invalid entry ordering.

## Brand and bootstrap ownership

- Shell logos use the canonical color-agnostic assets published under `@gouno/ui/brand-icons/*` and the same CSS-mask treatment as Showcase. Site-configured favicon metadata remains site data and does not replace the product mark in shell chrome.
- The parser-blocking theme bootstrap is read from `@gouno/ui/bootstrap.js` by the Vite build/dev pipeline. A committed `public/ui-bootstrap.js` copy is forbidden because it can drift from the installed package.
- The Blog-specific `theme-bootstrap.js` remains product-owned because it applies cached site title, description, and favicon metadata rather than Gouno UI theme behavior.

## Repository boundaries

Design-system work must continue to respect the root `AGENTS.md`: do not change connector behavior or `src/components/agent/ConnectorWorkspace.tsx` as part of general UI alignment, and do not introduce port `8443`.

## Verification

Before merging frontend changes, run:

```bash
npm run format && npm run quality
```
