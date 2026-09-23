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

const sharedLead = await source("src/components/patterns/TabPanelLead.tsx");
const patterns = await source("src/components/agent/OperationsPatterns.tsx");
requireText(
  patterns,
  "export function OperationsPanelLead",
  "Missing canonical AI Operations panel lead",
);
requireText(
  patterns,
  "../patterns/TabPanelLead",
  "AI Operations panel lead must reuse the shared Blog Admin pattern",
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

const inboxWorkspace = await source(
  "src/components/agent/DecisionInboxWorkspace.tsx",
);
requireText(
  inboxWorkspace,
  "xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]",
  "Decision Inbox must preserve the canonical master-detail geometry",
);
requireText(
  inboxWorkspace,
  "type-body-sm type-weight-semibold",
  "Decision Inbox rail header must use canonical typography tokens",
);

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
    'data-pattern="master-detail-composition"',
    `${path}: missing canonical master-detail composition contract`,
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
const decisionInbox = await source(
  "src/components/agent/DecisionInboxWorkspace.tsx",
);
const workflowRunRecords = await source(
  "src/components/agent/WorkflowRunRecords.tsx",
);
const agentRunRecordsMobile = await source(
  "src/components/agent/AgentRunRecords.tsx",
);

for (const marker of [
  "text-left type-weight-regular transition-colors",
]) {
  requireText(
    workflowWorkspace,
    marker,
    `WorkflowWorkspace: CSA-A003 semantic Typography binding is missing ${marker}`,
  );
}
if (workflowWorkspace.includes("text-left font-normal transition-colors")) {
  failures.push(
    "WorkflowWorkspace: retired CSA-A003 raw row weight returned",
  );
}

for (const [sourcePath, content, backLabel] of [
  [
    "DecisionInboxWorkspace.tsx",
    decisionInbox,
    "返回决策队列",
  ],
  [
    "WorkflowRunRecords.tsx",
    workflowRunRecords,
    "返回运行列表",
  ],
  [
    "AgentRunRecords.tsx",
    agentRunRecordsMobile,
    "返回运行列表",
  ],
]) {
  for (const marker of [
    'data-mobile-pane={mobilePane}',
    'data-slot="ops-detail-pane"',
    'setMobilePane("detail")',
    backLabel,
  ]) {
    requireText(
      content,
      marker,
      `${sourcePath}: CSA-A004 mobile Master/Detail contract is missing ${marker}`,
    );
  }
}

requireText(
  decisionInbox,
  'useState<"master" | "detail">("master")',
  "DecisionInboxWorkspace: mobile Inbox must remain queue-first despite desktop preselection",
);
for (const content of [workflowRunRecords, agentRunRecordsMobile]) {
  requireText(
    content,
    'new URLSearchParams(window.location.search).get("run") ? "detail" : "master"',
    "Run Center mobile pane must only enter detail from an explicit run deep link",
  );
}
requireText(
  workflowRunRecords,
  "void inspect(candidate, false)",
  "WorkflowRunRecords: background first-run preload must not manufacture a mobile run deep link",
);

requireText(
  workflowWorkspace,
  'data-slot="workflow-list-toolbar"',
  "Workflow list must preserve the canonical toolbar boundary",
);
requireText(
  workflowWorkspace,
  "xl:grid-cols-[minmax(17rem,1.45fr)_minmax(12rem,0.8fr)_minmax(16rem,1.15fr)_8rem_1.5rem]",
  "Workflow list must preserve the canonical five-column asset anatomy",
);
requireText(
  workflowWorkspace,
  "type-metric-value",
  "Workflow detail must use canonical metric-card typography rather than a generic summary strip",
);
requireText(
  workflowWorkspace,
  "rounded-lg border bg-muted/[0.18] p-4",
  "Workflow detail must preserve the canonical metric-card surface anatomy",
);
requireText(
  workflowWorkspace,
  "ScheduleFact",
  "Workflow detail must use the canonical schedule fact row",
);

requireText(
  workflowWorkspace,
  'data-slot="workflow-detail"',
  "WorkflowWorkspace: selected Workflow must use a dedicated detail surface",
);
requireText(
  workflowWorkspace,
  "返回 Workflow 列表",
  "WorkflowWorkspace: dedicated detail must expose an explicit return path",
);
requireText(
  workflowWorkspace,
  'data-pattern="dedicated-list-editor"',
  "WorkflowWorkspace: create/edit must use the canonical Dedicated Editor composition",
);
requireText(
  workflowWorkspace,
  "DedicatedEditorLead",
  "WorkflowWorkspace: create/edit must expose a Dedicated Editor lead",
);
requireText(
  workflowWorkspace,
  'data-pattern="editor-form-composition"',
  "WorkflowWorkspace: Workflow editor must expose the shared editor form composition",
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

const workflowRunDetail = await source(
  "src/components/agent/WorkflowRunDetail.tsx",
);
requireText(
  workflowRunDetail,
  'data-pattern="record-detail-composition"',
  "WorkflowRunDetail: selected Run must expose the canonical record-detail composition",
);

const agentRunRecords = await source(
  "src/components/agent/AgentRunRecords.tsx",
);
requireText(
  agentRunRecords,
  'data-pattern="record-detail-composition"',
  "AgentRunRecords: selected Run must expose the canonical record-detail composition",
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

requireText(
  workflowRunDetail,
  'aria-label={zh ? "运行资源" : "Run resources"}',
  "WorkflowRunDetail: resources must own a canonical standalone evidence section",
);
requireText(
  workflowRunDetail,
  'aria-label={zh ? "人工交互" : "Human interactions"}',
  "WorkflowRunDetail: human interactions must own a canonical standalone evidence section",
);
requireText(
  workflowRunDetail,
  "grid gap-6 xl:grid-cols-2",
  "WorkflowRunDetail: resource and human-interaction evidence must preserve the canonical responsive pair",
);
requireText(
  workflowRunDetail,
  "type-family-mono type-caption type-weight-semibold",
  "WorkflowRunDetail: persisted event names must use the canonical mono caption token",
);

// Migration metadata is a reporting ledger, not proof of parity. It is updated
// only after manual review and browser evidence have passed; never use its
// existing 'verified' value as an input to this contract.
if (failures.length) {
  console.error("AI Operations canonical layout contract failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  "AI Operations canonical layout, run-center, panel-lead and migration closure contract passed.",
);
