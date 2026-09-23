# Blog Admin DL-17 Typography Recertification

Status: **pending manual recertification**

Date: 2026-09-23

## Trigger

The post-freeze Final Drift Audit found one coherent design-language defect family across several already-certified Blog Admin surfaces: residual raw typography utilities remain in Canonical Showcase code and, in several cases, in the Product bindings that correctly copied or evolved from that Canonical source.

DL-17 explicitly separates semantic typography roles from raw Tailwind metrics. Product and Canonical code must not rebuild governed font size, weight, family, line-height or tracking with raw `text-*`, `font-*`, `leading-*` or `tracking-*` utilities when semantic Typography roles already exist.

This is a Canonical-source hardening batch, not evidence that reverse migration generally failed.

## Affected certification waves

- `blog-admin-ai`;
- `blog-admin-core-wave1`;
- `blog-admin-core-wave2`;
- `blog-admin-core-wave3`.

## Confirmed Canonical residuals

The audit confirmed raw typography seams in:

- Dashboard Top Posts rank/title/metrics;
- Post Editor history item density and Slug input;
- Page Editor Slug input;
- Categories Slug editor;
- Tags count badge;
- Media Library reference list;
- Site Settings RSS input;
- AI Operations workflow / run-row button weight;
- AI Settings Skill editor technical text fields.

The audit also found Product-side AI forms with additional raw mono/size/weight utilities. Those are not automatically classified as defects merely because they exist; only current-route bindings that violate the same DL-17 contract or diverge from Canonical will be included in this batch.

## Non-goals

This batch will not mechanically rewrite:

- Skeleton dimensions;
- intentional editor workspace heights;
- overflow ownership;
- code/JSON rendering that already uses semantic `type-family-mono` / `type-caption` roles;
- public Blog typography;
- unused or unrelated legacy components.

## Required correction flow

1. Keep all affected certifications demoted while Canonical authority is being changed.
2. Correct all confirmed raw Typography residuals in one Gouno UI Canonical PR.
3. Strengthen Canonical guards so raw utilities cannot silently return.
4. Run Canonical CI / visual evidence once for the batch and manually inspect affected rendered states.
5. Record the merged post-freeze amendment.
6. Propagate the accepted semantic Typography anatomy to Blog Product in one Consumer PR.
7. Strengthen Product parity guards, including any guard that currently pins a raw utility as required.
8. Run reciprocal parity / browser acceptance once for the Consumer batch.
9. Manually review retained evidence, then restore all affected certifications together.

Previous certification documents remain historical evidence only while this batch is pending.
