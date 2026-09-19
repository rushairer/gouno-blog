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

const patterns = await source("src/components/agent/OperationsPatterns.tsx");
requireText(
  patterns,
  "export function OperationsPanelLead",
  "Missing canonical AI Operations panel lead",
);
requireText(
  patterns,
  'data-pattern="tab-panel-lead"',
  "AI Operations panel lead must expose the shared semantic pattern marker",
);
requireText(
  patterns,
  "export function OperationsDedicatedEditorLead",
  "Missing canonical AI Operations Dedicated Editor lead",
);
requireText(
  patterns,
  'data-pattern="dedicated-editor-lead"',
  "AI Operations Dedicated Editor lead must expose the shared semantic pattern marker",
);

const objectRowOverflowGuards =
  patterns.match(/\[overflow-wrap:anywhere\]/g)?.length ?? 0;
if (objectRowOverflowGuards < 4) {
  failures.push(
    "OperationsObjectRow: variable title/meta/summary/signals must contain unbroken AI evidence without widening the rail",
  );
}

requireText(
  patterns,
  "edge-s-emphasis",
  "OperationsObjectRow: canonical selected rail edge must use the logical-start emphasis utility",
);
if (/border-l-(?:2|primary|transparent)/.test(patterns)) {
  failures.push(
    "OperationsObjectRow: physical left-border ownership is retired; use canonical logical-start edge semantics",
  );
}

const panelConsumers = [
  "src/components/agent/WorkspaceOverview.tsx",
  "src/components/agent/DecisionInboxWorkspace.tsx",
  "src/components/agent/WorkflowWorkspace.tsx",
  "src/pages/admin/AIOperations.tsx",
];
for (const path of panelConsumers) {
  const text = await source(path);
  requireText(
    text,
    "OperationsPanelLead",
    `${path}: top-level tab title/subtitle must use OperationsPanelLead`,
  );
}

const railFiles = [
  "src/components/agent/WorkflowRunRecords.tsx",
  "src/components/agent/DecisionInboxWorkspace.tsx",
  "src/components/agent/AgentRunRecords.tsx",
];
for (const path of railFiles) {
  const text = await source(path);
  if (/border-l-(?:2|primary|transparent)/.test(text)) {
    failures.push(
      `${path}: adaptive rails must not regress to physical left-border state markers`,
    );
  }
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
  requireText(
    text,
    'data-slot="ops-rail"',
    `${path}: missing adaptive rail marker`,
  );
  requireText(
    text,
    'data-slot="ops-rail-body"',
    `${path}: missing adaptive rail-body marker`,
  );
}

const workflowWorkspace = await source(
  "src/components/agent/WorkflowWorkspace.tsx",
);
requireText(
  workflowWorkspace,
  'data-slot="workflow-detail"',
  "WorkflowWorkspace: selected Workflow must use a dedicated detail surface",
);
requireText(
  workflowWorkspace,
  'data-pattern="dedicated-list-editor"',
  "WorkflowWorkspace: Workflow create/edit must use the Dedicated List Editor composition",
);
requireText(
  workflowWorkspace,
  "OperationsDedicatedEditorLead",
  "WorkflowWorkspace: Workflow create/edit must use the canonical Dedicated Editor lead",
);
requireText(
  workflowWorkspace,
  "返回 Workflow 列表",
  "WorkflowWorkspace: dedicated detail must expose an explicit return path",
);
if (
  workflowWorkspace.includes('data-slot="ops-master-detail"') ||
  workflowWorkspace.includes('data-slot="ops-rail"') ||
  workflowWorkspace.includes('data-slot="ops-rail-body"')
) {
  failures.push(
    "WorkflowWorkspace: retired master-detail rail must not return; Automation uses list -> dedicated detail",
  );
}
if (workflowWorkspace.includes("section-stack")) {
  failures.push(
    "src/components/agent/WorkflowWorkspace.tsx: retired section-stack composition must not return",
  );
}
requireText(
  workflowWorkspace,
  "sm:grid-cols-[7rem_7rem_minmax(7rem,0.7fr)_6rem_minmax(0,1.5fr)]",
  "Workflow Recent Runs must preserve the canonical five-column responsive anatomy",
);
requirePattern(
  workflowWorkspace,
  /recentRuns\.length[\s\S]{0,180}<div className="divide-y">/,
  "Workflow Recent Runs must preserve the canonical divider container",
);
requireText(
  workflowWorkspace,
  "[&>span]:contents",
  "Workflow Recent Runs must flatten the Button/ButtonLink content wrapper like Showcase",
);
requireText(
  workflowWorkspace,
  "onOpenRun?.(workflow.id, run.id)",
  "Workflow Recent Runs must delegate product routing through the canonical Button callback",
);
if (workflowWorkspace.includes("ButtonLink")) {
  failures.push(
    "WorkflowWorkspace: canonical automation actions and Recent Runs must not regress to ButtonLink anchor anatomy",
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

const agentRunRecords = await source(
  "src/components/agent/AgentRunRecords.tsx",
);
requireText(
  agentRunRecords,
  "summary={agentRunSummary(run, locale)}",
  "Agent Run rail must use a bounded navigation summary instead of full AI output",
);
requireText(
  agentRunRecords,
  "{agentRunSummary(selectedRun.run, locale)}",
  "Agent Run detail header must keep full Markdown inside the AI output region",
);

for (const path of [
  "src/components/agent/WorkflowRunRecords.tsx",
  "src/components/agent/AgentRunRecords.tsx",
]) {
  const text = await source(path);
  requireText(
    text,
    "xl:grid-cols-[19rem_minmax(0,1fr)]",
    `${path}: Run Center rail width must match Showcase`,
  );
}

const decisionInbox = await source(
  "src/components/agent/DecisionInboxWorkspace.tsx",
);
requireText(
  decisionInbox,
  'data-pattern="master-detail-composition"',
  "DecisionInboxWorkspace: decision queue must expose the canonical Master-Detail composition",
);
requireText(
  decisionInbox,
  "xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]",
  "DecisionInboxWorkspace: decision queue rail width must match Showcase",
);

const workflowRunRecords = await source(
  "src/components/agent/WorkflowRunRecords.tsx",
);
requireText(
  workflowRunRecords,
  'data-pattern="master-detail-composition"',
  "WorkflowRunRecords: Run Center must expose the canonical Master-Detail composition",
);

const workflowRunDetail = await source(
  "src/components/agent/WorkflowRunDetail.tsx",
);
requireText(
  workflowRunDetail,
  'data-pattern="record-detail-composition"',
  "WorkflowRunDetail: Workflow Run evidence must expose the canonical Record Detail composition",
);
if (/<h2\b/.test(workflowRunDetail)) {
  failures.push(
    "WorkflowRunDetail: canonical Run heading must use the shared Heading owner instead of raw h2 typography",
  );
}

requireText(
  agentRunRecords,
  'data-pattern="master-detail-composition"',
  "AgentRunRecords: Agent Run Center must expose the canonical Master-Detail composition",
);
requireText(
  agentRunRecords,
  'data-pattern="record-detail-composition"',
  "AgentRunRecords: Agent Run evidence must expose the canonical Record Detail composition",
);
if (/<h2\b/.test(agentRunRecords)) {
  failures.push(
    "AgentRunRecords: canonical Run heading must use the shared Heading owner instead of raw h2 typography",
  );
}

const page = await source("src/pages/admin/AIOperations.tsx");
if (page.includes("<Segmented")) {
  failures.push(
    "AIOperations: Run Center must use the canonical panel-lead action switch, not a detached Segmented control",
  );
}

const inputForm = await source("src/components/agent/WorkflowInputForm.tsx");
requirePattern(
  inputForm,
  /data-slot="workflow-input-form"[\s\S]{0,180}className="[^"]*workflow-input-form[^"]*flex[^"]*flex-col[^"]*gap-5[^"]*"/,
  "Workflow runtime inputs must own a canonical gap instead of relying on incidental Field margins",
);

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

const migration = JSON.parse(
  await readFile(resolve(root, "../docs/ui-redesign/migration.json"), "utf8"),
);
const requiredMigrationIds = new Set([
  "blog-admin:pages/admin/AIOperations.tsx",
  "blog-admin:components/agent/AgentRunRecords.tsx",
  "blog-admin:components/agent/InboxWorkspace.tsx",
  "blog-admin:components/agent/WorkflowRunRecords.tsx",
  "blog-admin:components/agent/WorkflowWorkspace.tsx",
  "blog-admin:components/agent/WorkspaceOverview.tsx",
]);
const migrationRows = new Map();
function collect(value) {
  if (Array.isArray(value)) return value.forEach(collect);
  if (!value || typeof value !== "object") return;
  if (typeof value.id === "string") migrationRows.set(value.id, value);
  Object.values(value).forEach(collect);
}
collect(migration);
for (const id of requiredMigrationIds) {
  const row = migrationRows.get(id);
  if (
    !row ||
    row.implementation !== "migrated" ||
    row.verification !== "verified"
  ) {
    failures.push(
      `${id}: AI Operations route cannot be declared complete while this visible owned surface is unresolved`,
    );
  }
}

if (failures.length) {
  console.error("AI Operations canonical layout contract failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  "AI Operations canonical layout, run-center, panel-lead and migration closure contract passed.",
);
