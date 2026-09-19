// Compares drift-prone AI Operations composition markers with current gouno-ui/main.
// Keep this source-level guard paired with rendered Playwright parity; neither layer is sufficient alone.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const canonicalRoot = process.env.GOUNO_UI_CANONICAL_ROOT;
if (!canonicalRoot) {
  throw new Error("GOUNO_UI_CANONICAL_ROOT is required");
}

const failures = [];
const readCanonical = (path) => readFile(resolve(canonicalRoot, path), "utf8");
const readBlog = (path) => readFile(resolve(path), "utf8");

const canonicalLead = await readCanonical(
  "showcase/components/tab-panel-lead.tsx",
);
const canonicalAutomation = await readCanonical(
  "showcase/demos/products/blog-admin/ai/operations/automation-management.tsx",
);
const canonicalRecords = await readCanonical(
  "showcase/demos/products/blog-admin/ai/operations/automation-records.tsx",
);
const canonicalInbox = await readCanonical(
  "showcase/demos/products/blog-admin/ai/operations/overview-inbox.tsx",
);
const canonicalSettings = await readCanonical(
  "showcase/demos/products/blog-admin/ai/settings/index.tsx",
);
const canonicalSettingsEditors = await readCanonical(
  "showcase/demos/products/blog-admin/ai/settings/editors.tsx",
);
const canonicalContract = await readCanonical(
  "tests/product-blog-admin-ai-operations-run-center-contract.test.ts",
);

const blogPatterns = await readBlog(
  "src/components/agent/OperationsPatterns.tsx",
);
const blogAutomation = await readBlog(
  "src/components/agent/WorkflowWorkspace.tsx",
);
const blogWorkflowRecords = await readBlog(
  "src/components/agent/WorkflowRunRecords.tsx",
);
const blogAgentRecords = await readBlog(
  "src/components/agent/AgentRunRecords.tsx",
);
const blogPage = await readBlog("src/pages/admin/AIOperations.tsx");
const blogDecisionInbox = await readBlog(
  "src/components/agent/DecisionInboxWorkspace.tsx",
);
const blogWorkflowDetail = await readBlog(
  "src/components/agent/WorkflowRunDetail.tsx",
);
const blogSettingsWorkspace = await readBlog(
  "src/components/agent/AdvancedWorkspace.tsx",
);
const blogSettingsPatterns = await readBlog(
  "src/components/agent/AISettingsEditorPatterns.tsx",
);
const blogAgentForm = await readBlog("src/components/agent/AgentForm.tsx");
const blogSkillForm = await readBlog("src/components/agent/SkillForm.tsx");
const blogProviderForm = await readBlog("src/components/agent/ProviderForm.tsx");
const blogEmbeddingForm = await readBlog("src/components/agent/EmbeddingForm.tsx");
const blogConnector = await readBlog(
  "src/components/agent/ConnectorWorkspace.tsx",
);

function requireBoth(marker, canonical, consumer, label) {
  if (!canonical.includes(marker)) {
    failures.push(
      `Canonical Showcase no longer exposes expected ${label}: ${marker}`,
    );
    return;
  }
  if (!consumer.includes(marker)) {
    failures.push(`Blog Admin drifted from Showcase ${label}: ${marker}`);
  }
}

requireBoth(
  'data-pattern="tab-panel-lead"',
  canonicalLead,
  blogPatterns,
  "tab-panel lead semantics",
);
requireBoth(
  "sm:grid-cols-[7rem_7rem_minmax(7rem,0.7fr)_6rem_minmax(0,1.5fr)]",
  canonicalAutomation,
  blogAutomation,
  "Recent Runs five-column anatomy",
);
requireBoth(
  "[&>span]:contents",
  canonicalAutomation,
  blogAutomation,
  "Recent Runs wrapper flattening",
);
requireBoth(
  "xl:grid-cols-[19rem_minmax(0,1fr)]",
  canonicalRecords,
  blogWorkflowRecords,
  "Workflow Run Center rail width",
);
requireBoth(
  "xl:grid-cols-[19rem_minmax(0,1fr)]",
  canonicalRecords,
  blogAgentRecords,
  "Agent Run Center rail width",
);

for (const marker of ["Workflow 任务", "Agent 运行"]) {
  if (!canonicalRecords.includes(marker)) {
    failures.push(`Canonical Run Center contract changed: missing ${marker}`);
  }
  if (!blogPage.includes(marker)) {
    failures.push(`Blog Run Center missing canonical marker: ${marker}`);
  }
}

if (!canonicalRecords.includes('aria-label="运行中心"')) {
  failures.push("Canonical Run Center must expose the route-level 运行中心 label");
}
if (!blogPage.includes('"运行中心" : "Run center"')) {
  failures.push("Blog Run Center must expose the canonical route-level label");
}
if (canonicalRecords.includes('title="运行证据中心"')) {
  failures.push("Canonical Run Center must not echo the active tab with a panel title");
}
if (blogPage.includes('"运行证据中心"') || blogPage.includes('"Run evidence center"')) {
  failures.push("Blog Run Center still echoes the active tab with a redundant panel title");
}

if (!canonicalContract.includes("TabPanelLead")) {
  failures.push(
    "Canonical Gouno UI AI Operations run-center contract no longer governs TabPanelLead",
  );
}
if (!blogPage.includes("OperationsPanelLead")) {
  failures.push("Blog AI Operations route must use OperationsPanelLead");
}
if (blogPage.includes("<Segmented")) {
  failures.push(
    "Blog Run Center must not regress to detached Segmented control",
  );
}

requireBoth(
  'data-pattern="master-detail-composition"',
  canonicalInbox,
  blogDecisionInbox,
  "Inbox Master-Detail composition",
);
requireBoth(
  "xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]",
  canonicalInbox,
  blogDecisionInbox,
  "Inbox adaptive rail anatomy",
);
for (const [consumer, label] of [
  [blogWorkflowRecords, "Workflow Run Center"],
  [blogAgentRecords, "Agent Run Center"],
]) {
  requireBoth(
    'data-pattern="master-detail-composition"',
    canonicalRecords,
    consumer,
    `${label} Master-Detail composition`,
  );
}
for (const [consumer, label] of [
  [blogWorkflowDetail, "Workflow Run detail"],
  [blogAgentRecords, "Agent Run detail"],
]) {
  requireBoth(
    'data-pattern="record-detail-composition"',
    canonicalRecords,
    consumer,
    `${label} Record-Detail composition`,
  );
}
requireBoth(
  'data-pattern="dedicated-list-editor"',
  canonicalAutomation,
  blogAutomation,
  "Workflow Dedicated List Editor composition",
);

requireBoth(
  'data-pattern="settings-composition"',
  canonicalSettings,
  blogSettingsWorkspace,
  "AI Settings composition",
);
if (!canonicalSettings.includes('data-pattern="dedicated-list-editor"')) {
  failures.push("Canonical AI Settings no longer exposes Dedicated List Editor composition");
}
if ((blogSettingsWorkspace.match(/data-pattern="dedicated-list-editor"/g) || []).length < 2) {
  failures.push("Blog AI Settings must keep Agent and Skill as Dedicated List Editors");
}
if (!canonicalSettings.includes('data-pattern="contextual-list-editor"')) {
  failures.push("Canonical AI Settings no longer exposes Contextual List Editor composition");
}
if ((blogSettingsWorkspace.match(/data-pattern="contextual-list-editor"/g) || []).length < 2) {
  failures.push("Blog AI Settings must keep Provider and Embedding as contextual Drawer editors");
}
if (!blogConnector.includes('data-pattern="contextual-list-editor"')) {
  failures.push("Blog AI Settings Connector creation must use the contextual Drawer editor composition");
}
if (!canonicalSettingsEditors.includes('data-pattern="editor-form-composition"')) {
  failures.push("Canonical AI Settings editors no longer expose Editor Form composition");
}
for (const [consumer, label] of [
  [blogAgentForm, "Agent"],
  [blogSkillForm, "Skill"],
  [blogProviderForm, "Provider"],
  [blogEmbeddingForm, "Embedding"],
  [blogConnector, "Connector"],
]) {
  if (!consumer.includes('data-pattern="editor-form-composition"')) {
    failures.push(`Blog AI Settings ${label} editor is missing canonical Editor Form composition`);
  }
}
if (!blogSettingsPatterns.includes('data-pattern="dedicated-editor-lead"')) {
  failures.push("Blog AI Settings must keep a canonical Dedicated Editor lead owner");
}

if (failures.length) {
  console.error("Blog Admin AI cross-repository Showcase parity failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Blog Admin AI Operations + AI Settings Showcase parity passed against current gouno-ui/main.",
);
