import { readFile, writeFile } from "node:fs/promises";

async function edit(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: hardening produced no changes`);
  await writeFile(path, after);
}

function replaceOnce(source, from, to, label) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`missing ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`ambiguous ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

await edit("blog-frontend/src/components/agent/WorkflowWorkspace.tsx", (source) => {
  source = replaceOnce(
    source,
    '<div className="grid min-w-0 gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">',
    '<div data-slot="ops-master-detail" className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">',
    "Workflow master-detail grid",
  );
  source = replaceOnce(
    source,
    'className="min-w-0 overflow-hidden rounded-lg border bg-background"\n            aria-label={',
    'data-slot="ops-rail"\n            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background"\n            aria-label={',
    "Workflow adaptive rail",
  );
  source = replaceOnce(
    source,
    '<div className="border-b bg-muted/20 p-4">',
    '<div className="shrink-0 border-b bg-muted/20 p-4">',
    "Workflow rail header",
  );
  source = replaceOnce(
    source,
    'aria-label={locale === "zh" ? "Workflow 列表" : "Workflow list"}\n              className="max-h-[48rem] overflow-y-auto"',
    'data-slot="ops-rail-body"\n              aria-label={locale === "zh" ? "Workflow 列表" : "Workflow list"}\n              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"',
    "Workflow rail body",
  );
  source = replaceOnce(
    source,
    '<div className="workflow-detail-view section-stack min-w-0">',
    '<div className="workflow-detail-view min-w-0">',
    "dead Workflow detail section-stack",
  );
  source = replaceOnce(
    source,
    '<div className="section-stack">\n                  <section',
    '<div data-slot="ops-detail-stack" className="flex min-w-0 flex-col gap-5">\n                  <section',
    "Workflow detail stack",
  );
  source = replaceOnce(
    source,
    '<FormLayout onSubmit={submit}>',
    '<FormLayout data-slot="workflow-editor-form" className="workflow-editor-form" onSubmit={submit}>',
    "Workflow editor form slot",
  );
  return source;
});

await edit("blog-frontend/src/components/agent/WorkflowInputForm.tsx", (source) => {
  source = replaceOnce(
    source,
    '<div className="workflow-input-form">',
    '<div data-slot="workflow-input-form" className="workflow-input-form flex min-w-0 flex-col gap-5">',
    "Workflow input vertical rhythm",
  );
  source = replaceOnce(
    source,
    '<details className="workflow-advanced-input">',
    '<details className="workflow-advanced-input border-t pt-5">',
    "Workflow advanced input separation",
  );
  return source;
});

await edit("blog-frontend/src/components/agent/WorkflowRunRecords.tsx", (source) => {
  source = replaceOnce(
    source,
    '<div className="grid min-w-0 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">',
    '<div data-slot="ops-master-detail" className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">',
    "Run center master-detail",
  );
  source = replaceOnce(
    source,
    'className="min-w-0 overflow-hidden rounded-lg border bg-background"\n            aria-label={zh ? "Workflow Runs" : "Workflow Runs"}',
    'data-slot="ops-rail"\n            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background"\n            aria-label={zh ? "Workflow Runs" : "Workflow Runs"}',
    "Run center adaptive rail",
  );
  source = replaceOnce(
    source,
    '<div className="border-b bg-muted/20 px-4 py-3">',
    '<div className="shrink-0 border-b bg-muted/20 px-4 py-3">',
    "Run center rail header",
  );
  source = replaceOnce(
    source,
    'aria-label={zh ? "Workflow 运行列表" : "Workflow run list"}\n              className="max-h-[56rem] overflow-y-auto"',
    'data-slot="ops-rail-body"\n              aria-label={zh ? "Workflow 运行列表" : "Workflow run list"}\n              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"',
    "Run center rail body",
  );
  return source;
});

await edit("blog-frontend/src/components/agent/DecisionInboxWorkspace.tsx", (source) => {
  source = replaceOnce(
    source,
    '<div className="grid min-w-0 overflow-hidden rounded-lg border bg-background xl:grid-cols-[22rem_minmax(0,1fr)]">',
    '<div data-slot="ops-master-detail" className="grid min-w-0 items-stretch overflow-hidden rounded-lg border bg-background xl:grid-cols-[22rem_minmax(0,1fr)]">',
    "Decision master-detail",
  );
  source = replaceOnce(
    source,
    '<aside\n          className="border-b xl:border-b-0 xl:border-r"\n          aria-label={zh ? "决策队列" : "Decision queue"}',
    '<aside\n          data-slot="ops-rail"\n          className="flex min-h-0 min-w-0 flex-col border-b xl:border-b-0 xl:border-r"\n          aria-label={zh ? "决策队列" : "Decision queue"}',
    "Decision adaptive rail",
  );
  source = replaceOnce(
    source,
    '<div className="border-b bg-muted/20 px-4 py-3">',
    '<div className="shrink-0 border-b bg-muted/20 px-4 py-3">',
    "Decision rail header",
  );
  source = replaceOnce(
    source,
    'aria-label={zh ? "待处理列表" : "Decision items"}\n            className="max-h-[48rem] overflow-y-auto"',
    'data-slot="ops-rail-body"\n            aria-label={zh ? "待处理列表" : "Decision items"}\n            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"',
    "Decision rail body",
  );
  return source;
});

await edit("blog-frontend/src/components/agent/AgentRunRecords.tsx", (source) => {
  source = source.replaceAll('className="section-stack"', 'className="flex flex-col gap-5"');
  source = source.replaceAll('className="agent-run-detail-view section-stack"', 'className="agent-run-detail-view flex min-w-0 flex-col gap-5"');
  if (source.includes("section-stack")) throw new Error("AgentRunRecords still contains section-stack");
  return source;
});

await edit("blog-frontend/src/styles/agent-console.css", (source) => {
  source = replaceOnce(
    source,
    '  .workflow-schema-builder,\n  .workflow-step-cards,\n  .workflow-discovery-picker {\n    display: grid;\n    gap: 10px;\n    padding: 14px;',
    '  .workflow-schema-builder,\n  .workflow-step-cards,\n  .workflow-discovery-picker {\n    display: grid;\n    gap: 20px;\n    padding: 20px;',
    "Workflow editor section rhythm",
  );
  source = replaceOnce(
    source,
    '  .workflow-schema-field,\n  .workflow-step-card {\n    display: grid;\n    gap: 8px;\n    padding: 12px;',
    '  .workflow-schema-field,\n  .workflow-step-card {\n    display: grid;\n    gap: 16px;\n    padding: 16px;',
    "Workflow editor item rhythm",
  );
  const anchor = '  .workflow-schema-field,\n  .workflow-step-card {';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error("missing Workflow editor CSS anchor");
  const gridRule = '  .workflow-editor-form .form-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 20px;\n    align-items: start;\n  }\n\n';
  source = source.slice(0, index) + gridRule + source.slice(index);
  const mediaMarker = '  @media (max-width: 640px) {\n    .workflow-step-card > header {';
  const responsiveGrid = '  @media (max-width: 900px) {\n    .workflow-editor-form .form-grid {\n      grid-template-columns: minmax(0, 1fr);\n    }\n  }\n\n';
  if (!source.includes(mediaMarker)) throw new Error("missing Workflow editor media marker");
  source = source.replace(mediaMarker, responsiveGrid + mediaMarker);
  const detailsAnchor = '  .workflow-detail-nav {';
  const detailsRule = '  .workflow-advanced-input[open] > textarea {\n    margin-top: 16px;\n  }\n\n  .workflow-advanced-input[open] > [role="alert"] {\n    margin-top: 12px;\n  }\n\n';
  if (!source.includes(detailsAnchor)) throw new Error("missing Workflow detail nav anchor");
  source = source.replace(detailsAnchor, detailsRule + detailsAnchor);
  return source;
});

await edit("blog-frontend/src/components/agent/__tests__/WorkflowWorkspaceCanonicalDetail.test.tsx", (source) => {
  const marker = '    expect(\n      screen.getByRole("list", { name: "Workflow 列表" }),\n    ).toBeInTheDocument();';
  if (!source.includes(marker)) throw new Error("missing Workflow canonical list assertion");
  const addition = `${marker}\n    const workflowList = screen.getByRole("list", { name: "Workflow 列表" });\n    expect(workflowList).toHaveAttribute("data-slot", "ops-rail-body");\n    expect(workflowList.className).toContain("flex-1");\n    expect(workflowList.className).not.toContain("max-h-[");\n    expect(workflowList.closest('[data-slot="ops-rail"]')).toHaveClass("flex", "min-h-0");\n    expect(workflowList.closest('[data-slot="ops-master-detail"]')).toBeInTheDocument();`;
  source = source.replace(marker, addition);
  return source;
});

await edit("blog-frontend/src/components/agent/__tests__/WorkflowInputForm.test.tsx", (source) => {
  const describeMarker = 'describe("WorkflowInputForm"';
  if (!source.includes(describeMarker)) throw new Error("missing WorkflowInputForm describe marker");
  const close = source.lastIndexOf("});");
  if (close < 0) throw new Error("missing WorkflowInputForm suite close");
  const test = `\n  it("owns canonical vertical field rhythm", () => {\n    const { container } = render(\n      <WorkflowInputForm\n        schema={{ type: "object", properties: { title: { type: "string", title: "标题" }, format: { type: "string", title: "输出格式" } } }}\n        value={{ title: "", format: "" }}\n        onChange={vi.fn()}\n        locale="zh"\n      />,\n    );\n    const form = container.querySelector('[data-slot="workflow-input-form"]');\n    expect(form).toBeInTheDocument();\n    expect(form).toHaveClass("flex", "flex-col", "gap-5");\n  });\n`;
  return source.slice(0, close) + test + source.slice(close);
});

await edit("blog-frontend/src/components/agent/__tests__/WorkflowWorkspace.test.tsx", (source) => {
  return replaceOnce(
    source,
    '    await user.click(screen.getByRole("button", { name: "Delete" }));',
    '    await user.click(screen.getByRole("button", { name: "More Workflow actions" }));\n    await user.click(screen.getByRole("menuitem", { name: "Delete Workflow" }));',
    "stale direct Workflow delete test",
  );
});

await edit("blog-frontend/package.json", (source) => {
  const from = '"lint:ui": "node scripts/check-ui-contracts.mjs && node scripts/check-retired-product-classes.mjs && node scripts/check-admin-parity-contracts.mjs && node scripts/check-privileged-access-parity.mjs && node scripts/check-public-parity-contracts.mjs && node scripts/check-action-grammar-contracts.mjs"';
  const to = '"lint:ui": "node scripts/check-ui-contracts.mjs && node scripts/check-retired-product-classes.mjs && node scripts/check-admin-parity-contracts.mjs && node scripts/check-privileged-access-parity.mjs && node scripts/check-public-parity-contracts.mjs && node scripts/check-action-grammar-contracts.mjs && node scripts/check-ai-ops-layout-contracts.mjs"';
  return replaceOnce(source, from, to, "lint:ui command");
});

console.log("Blog AI Operations product layout hardening applied.");
