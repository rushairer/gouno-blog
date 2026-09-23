import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];

const source = (path) => readFile(resolve(root, path), "utf8");

function requireText(text, marker, message) {
  if (!text.includes(marker)) failures.push(message);
}

function requireCount(text, marker, count, message) {
  const found = text.split(marker).length - 1;
  if (found < count) failures.push(`${message} (expected >= ${count}, found ${found})`);
}

const sharedLead = await source("src/components/patterns/TabPanelLead.tsx");
const workspace = await source("src/components/agent/AdvancedWorkspace.tsx");
const editorPatterns = await source(
  "src/components/agent/AISettingsEditorPatterns.tsx",
);
const connectorWorkspace = await source(
  "src/components/agent/ConnectorWorkspace.tsx",
);
const knowledgeWorkspace = await source(
  "src/components/agent/KnowledgeWorkspace.tsx",
);
requireText(
  sharedLead,
  'data-pattern="tab-panel-lead"',
  "Shared TabPanelLead must expose the semantic pattern marker",
);
requireText(
  sharedLead,
  "flex min-h-9 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
  "Shared TabPanelLead must preserve the canonical minimum-height rhythm",
);
if (workspace.includes("function TabPanelLead(")) {
  failures.push("AdvancedWorkspace must not carry a private TabPanelLead implementation");
}
requireText(
  workspace,
  'from "../patterns/TabPanelLead"',
  "AI Settings must consume the shared TabPanelLead pattern",
);
requireText(
  connectorWorkspace,
  "<TabPanelLead",
  "Connector collection must consume the shared TabPanelLead pattern",
);

for (const [marker, label] of [
  ["<TabPanelLead", "shared panel lead"],
  ["<TabPanelFeedback>", "panel feedback ordering"],
  ['id="knowledge-overview-title"', "index overview section"],
  ['id="knowledge-content-title"', "indexed content section"],
  ['id="knowledge-retrieval-title"', "retrieval validation section"],
  ['id="knowledge-embedding-title"', "Embedding configuration section"],
  ["citation_id", "citation evidence rendering"],
  ["semantic_score", "semantic score rendering"],
  ["lexical_score", "lexical score rendering"],
]) {
  requireText(
    knowledgeWorkspace,
    marker,
    `Knowledge workspace must preserve canonical ${label}`,
  );
}

requireText(
  workspace,
  "DedicatedEditorLead",
  "AI Settings Agent/Skill editors must use the canonical Dedicated Editor lead",
);
requireCount(
  workspace,
  'data-pattern="dedicated-list-editor"',
  2,
  "AI Settings Agent and Skill must both replace their collections with Dedicated Editor composition",
);
requireCount(
  workspace,
  'data-pattern="settings-composition"',
  5,
  "AdvancedWorkspace-owned AI Settings collections must expose the settings composition boundary",
);
requireText(
  knowledgeWorkspace,
  'data-pattern="settings-composition"',
  "Knowledge workspace must expose the settings composition boundary",
);
requireCount(
  workspace,
  'data-pattern="contextual-list-editor"',
  2,
  "Provider and Embedding editors must remain contextual to their collections",
);
requireCount(
  workspace,
  "<Drawer",
  2,
  "Provider and Embedding editing must use Drawer task surfaces",
);
requireCount(
  workspace,
  'surface="dedicated"',
  2,
  "Agent and Skill forms must render as Dedicated Editor form bodies",
);
requireCount(
  workspace,
  'surface="drawer"',
  2,
  "Provider and Embedding forms must render as Drawer form bodies",
);
requireText(
  workspace,
  "window.scrollTo({ top: 0",
  "Entering a Dedicated Editor must reset page scroll",
);
for (const [formId, label] of [
  ["ai-settings-provider-editor", "Provider"],
  ["ai-settings-embedding-editor", "Embedding"],
]) {
  requireText(
    workspace,
    `form="${formId}"`,
    `${label} Drawer footer must own the submit action for its editor form`,
  );
}
requireText(
  connectorWorkspace,
  "<Drawer",
  "Connector editing must use a contextual Drawer task surface",
);
requireText(
  connectorWorkspace,
  'data-pattern="contextual-list-editor"',
  "Connector editor must remain contextual to the Connector collection",
);
requireText(
  connectorWorkspace,
  'data-pattern="editor-form-composition"',
  "Connector Drawer body must use the shared editor form composition",
);
requireText(
  connectorWorkspace,
  'form="ai-settings-connector-editor"',
  "Connector Drawer footer must own the submit action",
);

requireText(
  editorPatterns,
  'data-pattern="editor-form-section"',
  "Contextual AI Settings editors must expose the canonical editor-form-section grammar",
);
requireText(
  editorPatterns,
  'variant="subsection"',
  "Contextual AI Settings editor headers must use the canonical subsection typography variant",
);

for (const [path, minimumSections] of [
  ["src/components/agent/AgentForm.tsx", 4],
  ["src/components/agent/SkillForm.tsx", 5],
]) {
  const text = await source(path);
  for (const marker of [
    "DedicatedEditorLayout",
    "DedicatedEditorSection",
    "DedicatedEditorActions",
  ]) {
    requireText(
      text,
      marker,
      `${path}: Dedicated Editor body must use ${marker}`,
    );
  }
  requireCount(
    text,
    "<DedicatedEditorSection",
    minimumSections,
    `${path}: Dedicated Editor semantic sections drifted from the manually reviewed Showcase anatomy`,
  );
}

for (const path of [
  "src/components/agent/ProviderForm.tsx",
  "src/components/agent/EmbeddingForm.tsx",
  "src/components/agent/ConnectorWorkspace.tsx",
]) {
  const text = await source(path);
  requireText(
    text,
    "grid gap-5 xl:grid-cols-2",
    `${path}: contextual editor must preserve the canonical two-column section layout`,
  );
}

for (const path of [
  "src/components/agent/AgentForm.tsx",
  "src/components/agent/SkillForm.tsx",
  "src/components/agent/ProviderForm.tsx",
  "src/components/agent/EmbeddingForm.tsx",
]) {
  const text = await source(path);
  requireText(
    text,
    'data-pattern="editor-form-composition"',
    `${path}: editor body must expose the shared editor form composition`,
  );
  requireText(
    text,
    "surface",
    `${path}: editor must be aware of its owning task surface to avoid duplicate identity chrome`,
  );
}

const skillForm = await source("src/components/agent/SkillForm.tsx");
requireCount(
  skillForm,
  'className="type-family-mono"',
  2,
  "SkillForm: CSA-A003 technical fields must preserve semantic mono Typography",
);
if (skillForm.includes('className="font-mono"')) {
  failures.push(
    "SkillForm: retired CSA-A003 raw mono Typography returned",
  );
}

for (const path of [
  "src/components/agent/AgentForm.tsx",
  "src/components/agent/SkillForm.tsx",
]) {
  const text = await source(path);
  requireText(
    text,
    'surface === "page"',
    `${path}: Dedicated Editor must suppress the legacy nested editor header`,
  );
}

for (const path of [
  "src/components/agent/ProviderForm.tsx",
  "src/components/agent/EmbeddingForm.tsx",
]) {
  const text = await source(path);
  requireText(
    text,
    'surface === "page"',
    `${path}: Drawer must own editor identity instead of rendering a second page header`,
  );
  requireText(
    text,
    'id="ai-settings-',
    `${path}: contextual editor form must expose a stable form id for Drawer footer submission`,
  );
}

if (failures.length) {
  console.error("AI Settings composition contracts failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AI Settings composition contracts passed.");
