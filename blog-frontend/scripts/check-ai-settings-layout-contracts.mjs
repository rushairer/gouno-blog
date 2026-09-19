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

const workspace = await source("src/components/agent/AdvancedWorkspace.tsx");
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
  6,
  "Every AI Settings collection section must expose the settings composition boundary",
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
}

if (failures.length) {
  console.error("AI Settings composition contracts failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AI Settings composition contracts passed.");
