# UI Design System Baseline

This document defines the shared component contracts for the frontend. New UI
must use these primitives instead of reproducing their markup or layout rules.

## Foundations

- **Tokens**: consume the existing `--ui-*`, `--control-height`, typography,
  spacing, and radius variables. Do not introduce page-local substitutes for a
  common control value.
- **Primitives**: `Button`, `ButtonLink`, `IconButton`, form controls, `Panel`,
  feedback, modal, tabs, and layout components live in `src/components/ui`.
- **Composition**: pages compose primitives; they do not set a primitive's
  internal alignment, icon dimensions, or state colors.

## Button contract

Use `Button` for in-place text actions, `ButtonLink` for route navigation, and
`IconButton` for icon-only actions.

```tsx
<Button variant="primary" icon={<Plus />}>新建分类</Button>
<ButtonLink variant="primary" to="/admin/posts/new" icon={<Plus />}>
  新建文章
</ButtonLink>
<Button variant="secondary" icon={<ArrowRight />} iconPosition="right">
  下一步
</Button>
<IconButton label="编辑"><Pencil /></IconButton>
```

- Use the `icon` prop; do not put a leading or trailing SVG in `children`.
- `Button` owns the `btn__icon` and `btn__label` slots, including their size
  and vertical alignment.
- Use `loading` rather than adding a page-specific spinner.
- Use the four semantic variants only: `primary`, `secondary`, `danger`, and
  `ghost`. Add a variant only when its meaning is reusable across screens.

## Migration rule

Existing raw `<button>` and `className="btn ..."` usages remain compatible,
but any touched text action should be migrated to `Button` or `ButtonLink`.
