// Compares drift-prone AI Settings task-surface and composition markers with current gouno-ui/main.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const canonicalRoot = process.env.GOUNO_UI_CANONICAL_ROOT;
if (!canonicalRoot) throw new Error("GOUNO_UI_CANONICAL_ROOT is required");

const failures = [];
const readCanonical = (path) => readFile(resolve(canonicalRoot, path), "utf8");
const readBlog = (path) => readFile(resolve(path), "utf8");

const canonicalSettings = await readCanonical(
  "showcase/demos/products/blog-admin/ai/settings/index.tsx",
);
const canonicalLead = await readCanonical(
  "showcase/components/tab-panel-lead.tsx",
);
const canonicalEditors = await readCanonical(
  "showcase/demos/products/blog-admin/ai/settings/editors.tsx",
);
const canonicalGovernance = await readCanonical("docs/product-interface-governance.md");

const sharedLead = await readBlog(
  "src/components/patterns/TabPanelLead.tsx",
);
const workspace = await readBlog("src/components/agent/AdvancedWorkspace.tsx");
const editorPatterns = await readBlog(
  "src/components/agent/AISettingsEditorPatterns.tsx",
);
const connectorWorkspace = await readBlog(
  "src/components/agent/ConnectorWorkspace.tsx",
);
const forms = await Promise.all(
  [
    "src/components/agent/AgentForm.tsx",
    "src/components/agent/SkillForm.tsx",
    "src/components/agent/ProviderForm.tsx",
    "src/components/agent/EmbeddingForm.tsx",
  ].map(readBlog),
);

function requireCanonical(marker, label) {
  if (!canonicalSettings.includes(marker) && !canonicalGovernance.includes(marker)) {
    failures.push(`Canonical Gouno UI no longer exposes expected ${label}: ${marker}`);
  }
}

function requireBlog(marker, text, label) {
  if (!text.includes(marker)) {
    failures.push(`Blog Admin drifted from Showcase ${label}: ${marker}`);
  }
}

for (const [marker, label] of [
  ['data-pattern="tab-panel-lead"', "Tab panel lead semantic marker"],
  ['className="flex min-h-9 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"', "Tab panel lead minimum-height rhythm"],
]) {
  if (!canonicalLead.includes(marker)) {
    failures.push(`Canonical TabPanelLead changed: missing ${label}: ${marker}`);
  }
  requireBlog(marker, sharedLead, label);
}
if (workspace.includes("function TabPanelLead(")) {
  failures.push("AI Settings must not maintain a private TabPanelLead copy");
}
requireBlog(
  'from "../patterns/TabPanelLead"',
  workspace,
  "shared TabPanelLead ownership",
);
requireBlog(
  "<TabPanelLead",
  connectorWorkspace,
  "Connector shared TabPanelLead usage",
);
requireBlog(
  "<TabPanelFeedback>",
  connectorWorkspace,
  "Connector shared TabPanelFeedback usage",
);
requireBlog(
  "type-family-mono type-body-sm type-weight-semibold",
  workspace,
  "Tools canonical typography token",
);
requireBlog(
  '<Heading level={2} variant="compact">',
  workspace,
  "Provider default-purpose heading typography",
);

for (const [marker, label] of [
  ['data-pattern="dedicated-list-editor"', "Dedicated Editor collection replacement"],
  ['data-pattern="settings-composition"', "Settings composition"],
  ['data-pattern="contextual-list-editor"', "Contextual list editor"],
  ["DedicatedEditorLead", "Dedicated Editor lead"],
  ["<Drawer", "Drawer task surface"],
]) {
  requireCanonical(marker, label);
  requireBlog(marker, workspace, label);
}

if (!canonicalSettings.includes('editor.kind === "agent" || editor.kind === "skill"')) {
  failures.push("Canonical AI Settings no longer classifies Agent/Skill as page-level editors");
}
if (!workspace.includes('surface="dedicated"')) {
  failures.push("Blog AI Settings must render Agent/Skill form bodies on Dedicated Editor surfaces");
}

if (!canonicalSettings.includes("drawerEditor") || !workspace.includes('surface="drawer"')) {
  failures.push("Provider/Embedding editing must remain contextual Drawer editing");
}
for (const marker of [
  "<Drawer",
  'data-pattern="contextual-list-editor"',
  'data-pattern="editor-form-composition"',
  'form="ai-settings-connector-editor"',
]) {
  requireBlog(marker, connectorWorkspace, "Connector contextual Drawer editing");
}
if (
  !canonicalSettings.includes("drawerEditorPresentation.formId") ||
  !workspace.includes('form="ai-settings-provider-editor"') ||
  !workspace.includes('form="ai-settings-embedding-editor"')
) {
  failures.push(
    "Provider/Embedding Drawer footers must submit the stable editor form owned by the contextual task surface",
  );
}

if (!canonicalSettings.includes("window.scrollTo({ top: 0")) {
  failures.push("Canonical AI Settings no longer proves Dedicated Editor scroll reset");
}
if (!workspace.includes("window.scrollTo({ top: 0")) {
  failures.push("Blog AI Settings must reset scroll when entering a Dedicated Editor");
}

for (const marker of [
  "DedicatedEditorLayout",
  "DedicatedEditorSection",
  "DedicatedEditorActions",
]) {
  if (!canonicalEditors.includes(marker)) {
    failures.push(`Canonical AI Settings editor grammar changed: missing ${marker}`);
  }
  for (const [index, label] of ["AgentForm", "SkillForm"].entries()) {
    requireBlog(marker, forms[index], `${label} Dedicated Editor grammar`);
  }
}
if (!canonicalEditors.includes('data-pattern="editor-form-composition"')) {
  failures.push("Canonical AI Settings no longer exposes editor-form-composition");
}
requireBlog(
  'data-pattern="editor-form-section"',
  editorPatterns,
  "contextual editor section grammar",
);
requireBlog(
  'variant="subsection"',
  editorPatterns,
  "contextual editor header typography",
);
for (const [text, label] of [
  [forms[2], "ProviderForm"],
  [forms[3], "EmbeddingForm"],
  [connectorWorkspace, "ConnectorWorkspace"],
]) {
  requireBlog(
    "grid gap-5 xl:grid-cols-2",
    text,
    `${label} contextual two-column layout`,
  );
}

for (const [index, path] of [
  "AgentForm",
  "SkillForm",
  "ProviderForm",
  "EmbeddingForm",
].entries()) {
  requireBlog(
    'data-pattern="editor-form-composition"',
    forms[index],
    `${path} shared editor form grammar`,
  );
}

if (failures.length) {
  console.error("AI Settings cross-repository Showcase parity failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "AI Settings cross-repository Showcase parity passed against current gouno-ui/main.",
);
