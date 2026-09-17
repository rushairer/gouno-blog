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

const railFiles = [
  "src/components/agent/WorkflowWorkspace.tsx",
  "src/components/agent/WorkflowRunRecords.tsx",
  "src/components/agent/DecisionInboxWorkspace.tsx",
];

for (const path of railFiles) {
  const text = await source(path);
  if (/max-h-\[(?:42|44|46|48|56)rem\]/.test(text)) {
    failures.push(
      `${path}: AI Operations master-detail rails must be content-driven; fixed rem max-height is forbidden`,
    );
  }
  requireText(text, 'data-slot="ops-master-detail"', `${path}: missing canonical master-detail marker`);
  requireText(text, 'data-slot="ops-rail"', `${path}: missing adaptive rail marker`);
  requireText(text, 'data-slot="ops-rail-body"', `${path}: missing adaptive rail-body marker`);
}

const workflowWorkspace = await source("src/components/agent/WorkflowWorkspace.tsx");
if (workflowWorkspace.includes("section-stack")) {
  failures.push("src/components/agent/WorkflowWorkspace.tsx: retired section-stack composition must not return");
}
requireText(
  workflowWorkspace,
  'data-slot="ops-detail-stack" className="flex min-w-0 flex-col gap-5"',
  "Workflow detail spacing must be owned by one canonical parent stack",
);
requireText(
  workflowWorkspace,
  'data-slot="workflow-editor-form" className="workflow-editor-form"',
  "Workflow editor must expose its canonical form composition boundary",
);

const inputForm = await source("src/components/agent/WorkflowInputForm.tsx");
requireText(
  inputForm,
  'data-slot="workflow-input-form" className="workflow-input-form flex min-w-0 flex-col gap-5"',
  "Workflow runtime inputs must own a canonical gap instead of relying on incidental Field margins",
);

const agentRunRecords = await source("src/components/agent/AgentRunRecords.tsx");
if (agentRunRecords.includes("section-stack")) {
  failures.push("src/components/agent/AgentRunRecords.tsx: retired section-stack composition must not return");
}

const css = await source("src/styles/agent-console.css");
requireText(
  css,
  ".workflow-editor-form .form-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 20px;",
  "Workflow editor form grids must follow the canonical 20px FormGrid rhythm",
);
requireText(
  css,
  ".workflow-schema-field,\n  .workflow-step-card {\n    display: grid;\n    gap: 16px;\n    padding: 16px;",
  "Workflow editor item anatomy must preserve the canonical 16px internal rhythm",
);

if (failures.length) {
  console.error("AI Operations layout contract failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("AI Operations adaptive layout and spacing contract passed.");
