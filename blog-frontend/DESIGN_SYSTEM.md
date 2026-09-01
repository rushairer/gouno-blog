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
<IconButton label="编辑" icon={<Pencil />} />
```

- Use the `icon` prop; do not put a leading or trailing SVG in `children`.
- `IconButton` requires both `label` and `icon`; it owns the accessible name,
  fixed icon slot, compact size, and semantic visual tone. Never place SVG
  children directly in an icon-only action.
- `Button` owns the `btn__icon` and `btn__label` slots, including their size
  and vertical alignment.
- Use `loading` rather than adding a page-specific spinner.
- Use the four semantic variants only: `primary`, `secondary`, `danger`, and
  `ghost`. Add a variant only when its meaning is reusable across screens.

## Migration rule

Raw `<button>` and `className="btn ..."` are forbidden outside
`src/components/ui` semantic primitives. New and migrated interactions must use
`Button`, `ButtonLink`, or `IconButton` according to their navigation and
action semantics.

## Alignment and composition contract

- Controls use the shared regular or compact height only. A page may place a
  component in a layout, but must not offset its icon, label, or internal
  padding with page-local margins.
- `FilterBar`, `ActionGroup`, `PanelHeader`, `Pagination`, `Tabs`, `Modal`,
  and `Drawer` compose their own alignment. Pages provide content and actions,
  not duplicated control markup.
- Route changes use `ButtonLink`; in-place mutations use `Button`; icon-only
  mutations use `IconButton`. Semantic tabs remain the `Tabs` primitive.
- The UI contract checker rejects native buttons, native selects, direct SVG
  children in `Button`/`ButtonLink`/`ChoiceButton`, raw `btn` classes, and
  `buttonClassName` outside the shared UI primitives and test fixtures.
