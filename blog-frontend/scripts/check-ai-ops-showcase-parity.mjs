// Compares drift-prone AI Operations composition markers with current gouno-ui/main.
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

for (const marker of ["运行证据中心", "Workflow 任务", "Agent 运行"]) {
  if (!canonicalRecords.includes(marker)) {
    failures.push(`Canonical Run Center contract changed: missing ${marker}`);
  }
  if (!blogPage.includes(marker)) {
    failures.push(`Blog Run Center missing canonical marker: ${marker}`);
  }
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

if (failures.length) {
  console.error("AI Operations cross-repository Showcase parity failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "AI Operations cross-repository Showcase parity passed against current gouno-ui/main.",
);
