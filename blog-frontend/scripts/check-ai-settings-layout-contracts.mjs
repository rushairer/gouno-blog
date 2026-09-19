import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const failures = [];

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}
function requireText(text, marker, message) {
  if (!text.includes(marker)) failures.push(message);
}
function forbid(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

const patterns = await source("src/components/agent/AISettingsEditorPatterns.tsx");
for (const [marker, label] of [
  ['data-pattern="tab-panel-lead"', "shared Tab Panel Lead semantics"],
  ['data-pattern="tab-panel-feedback"', "shared Tab Panel Feedback semantics"],
  ['data-pattern="dedicated-editor-lead"', "Dedicated Editor lead semantics"],
  ['data-pattern="dedicated-editor-section"', "Dedicated Editor section semantics"],
  ['data-slot="ai-settings-dedicated-editor-actions"', "Dedicated Editor action boundary"],
]) {
  requireText(patterns, marker, `AISettingsEditorPatterns: missing ${label}`);
}
requireText(
  patterns,
  'className="flex min-h-9 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"',
  "AISettingsPanelLead must preserve the canonical minimum lead height/rhythm",
);

const workspace = await source("src/components/agent/AdvancedWorkspace.tsx");
requireText(
  workspace,
  'data-pattern="settings-composition"',
  "AI Settings list state must expose the canonical Settings composition boundary",
);
if ((workspace.match(/data-pattern="dedicated-list-editor"/g) || []).length < 2) {
  failures.push("AI Settings Agent and Skill must both use the Dedicated List Editor composition");
}
if ((workspace.match(/data-pattern="contextual-list-editor"/g) || []).length < 2) {
  failures.push("AI Settings Provider and Embedding must both use contextual Drawer editors");
}
if ((workspace.match(/<Drawer/g) || []).length < 2) {
  failures.push("AI Settings Provider and Embedding editors must be presented in Drawers");
}
requireText(
  workspace,
  'width={720}',
  "AI Settings contextual editors must preserve the canonical 720px Drawer width",
);
forbid(
  workspace,
  /function\s+TabPanelLead\b/,
  "AdvancedWorkspace must not own a parallel TabPanelLead implementation",
);

for (const path of [
  "src/components/agent/AgentForm.tsx",
  "src/components/agent/SkillForm.tsx",
]) {
  const text = await source(path);
  requireText(text, 'data-pattern="editor-form-composition"', `${path}: missing editor form composition`);
  requireText(text, 'data-pattern="dedicated-editor-layout"', `${path}: missing Dedicated Editor layout`);
  requireText(text, "AISettingsEditorHeader", `${path}: missing Dedicated Editor lead`);
  requireText(text, "AISettingsEditorSection", `${path}: missing Dedicated Editor sections`);
  requireText(text, "AISettingsEditorActions", `${path}: missing Dedicated Editor action boundary`);
}

for (const [path, formId] of [
  ["src/components/agent/ProviderForm.tsx", "ai-settings-provider-editor"],
  ["src/components/agent/EmbeddingForm.tsx", "ai-settings-embedding-editor"],
]) {
  const text = await source(path);
  requireText(text, 'data-pattern="editor-form-composition"', `${path}: missing editor form composition`);
  requireText(text, `id="${formId}"`, `${path}: Drawer footer must target a stable form id`);
  requireText(text, 'surface === "page"', `${path}: contextual Drawer surface must suppress page-only lead/actions`);
}

const connectors = await source("src/components/agent/ConnectorWorkspace.tsx");
requireText(connectors, "AISettingsPanelLead", "ConnectorWorkspace: missing canonical section lead");
requireText(connectors, "AISettingsPanelFeedback", "ConnectorWorkspace: feedback must use the canonical panel feedback boundary");
requireText(connectors, "<Drawer", "ConnectorWorkspace: Connector creation must use a contextual Drawer");
requireText(connectors, 'data-pattern="contextual-list-editor"', "ConnectorWorkspace: missing contextual list editor boundary");
requireText(connectors, 'data-pattern="editor-form-composition"', "ConnectorWorkspace: missing editor form composition");
requireText(connectors, 'id="ai-settings-connector-editor"', "ConnectorWorkspace: missing stable Drawer form id");
forbid(
  connectors,
  /grid min-w-0 gap-5 xl:grid-cols-\[minmax\(20rem,0\.85fr\)_minmax\(0,1\.15fr\)\]/,
  "ConnectorWorkspace: retired permanently split create-form/list layout must not return",
);

if (failures.length) {
  console.error("AI Settings canonical layout contract failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("AI Settings Settings/Dedicated/Contextual Editor composition contract passed.");
