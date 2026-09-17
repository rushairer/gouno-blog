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

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
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
  requireText(
    text,
    'data-slot="ops-master-detail"',
    `${path}: missing canonical master-detail marker`,
  );
  requireText(text, 'data-slot="ops-rail"', `${path}: missing adaptive rail marker`);
  requireText(
    text,
    'data-slot="ops-rail-body"',
    `${path}: missing adaptive rail-body marker`,
  );
}

const workflowWorkspace = await source("src/components/agent/WorkflowWorkspace.tsx");
if (workflowWorkspace.includes("section-stack")) {
  failures.push(
    "src/components/agent/WorkflowWorkspace.tsx: retired section-stack composition must not return",
  );
}
requirePattern(
  workflowWorkspace,
  /data-slot="ops-detail-stack"[\s\S]{0,180}className="[^"]*flex[^"]*flex-col[^"]*gap-5[^"]*"/,
  "Workflow detail spacing must be owned by one canonical parent stack",
);
requirePattern(
  workflowWorkspace,
  /<FormLayout[\s\S]{0,180}data-slot="workflow-editor-form"[\s\S]{0,180}className="workflow-editor-form"/,
  "Workflow editor must expose its canonical form composition boundary",
);

const inputForm = await source("src/components/agent/WorkflowInputForm.tsx");
requirePattern(
  inputForm,
  /data-slot="workflow-input-form"[\s\S]{0,180}className="[^"]*workflow-input-form[^"]*flex[^"]*flex-col[^"]*gap-5[^"]*"/,
  "Workflow runtime inputs must own a canonical gap instead of relying on incidental Field margins",
);

const agentRunRecords = await source("src/components/agent/AgentRunRecords.tsx");
if (agentRunRecords.includes("section-stack")) {
  failures.push(
    "src/components/agent/AgentRunRecords.tsx: retired section-stack composition must not return",
  );
}

const css = await source("src/styles/agent-console.css");
requirePattern(
  css,
  /\.workflow-editor-form \.form-grid\s*\{[\s\S]{0,220}grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]{0,120}gap:\s*20px;/,
  "Workflow editor form grids must follow the canonical 20px FormGrid rhythm",
);
requirePattern(
  css,
  /\.workflow-schema-field,\s*\.workflow-step-card\s*\{[\s\S]{0,140}gap:\s*16px;[\s\S]{0,100}padding:\s*16px;/,
  "Workflow editor item anatomy must preserve the canonical 16px internal rhythm",
);

if (failures.length) {
  console.error("AI Operations layout contract failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("AI Operations adaptive layout and spacing contract passed.");
