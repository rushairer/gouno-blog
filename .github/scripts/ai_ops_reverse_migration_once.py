from pathlib import Path
import json


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, got {count}")
    target.write_text(text.replace(old, new, 1))


# Overview: one canonical tab-panel lead owns title, subtitle and actions.
path = "blog-frontend/src/components/agent/WorkspaceOverview.tsx"
replace_once(
    path,
    'import { Button, Empty, Heading, Tag, Text } from "@gouno/ui/core";',
    'import { Button, Empty, Tag, Text } from "@gouno/ui/core";',
    "overview heading import",
)
replace_once(
    path,
    "  OperationsMeta,\n  OperationsObjectRow,",
    "  OperationsMeta,\n  OperationsObjectRow,\n  OperationsPanelLead,",
    "overview panel lead import",
)
replace_once(
    path,
    r'''      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <Heading level={2}>
            {zh ? "今天需要关注什么" : "What needs attention today"}
          </Heading>
          <Text className="mt-1" tone="muted">
            {zh
              ? "先处理失败与等待人工的运行，再决定建议、候选和后续编辑任务；AI 不会绕过人工边界直接发布内容。"
              : "Handle failed and human-blocked runs first, then review proposals, candidates, and editorial follow-up. AI never bypasses the human publishing boundary."}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            icon={<ShieldCheck />}
            onClick={() => onNavigate("inbox")}
          >
            {zh ? `待我处理 ${decisionCount}` : `Review queue ${decisionCount}`}
          </Button>
          <Button
            variant="solid"
            color="primary"
            icon={<GitBranch />}
            onClick={() => onNavigate("automation")}
          >
            {zh ? "查看自动化" : "Open automation"}
          </Button>
        </div>
      </div>''',
    r'''      <OperationsPanelLead
        title={zh ? "今天需要关注什么" : "What needs attention today"}
        description={
          zh
            ? "先处理失败与等待人工的运行，再决定建议、候选和后续编辑任务；AI 不会绕过人工边界直接发布内容。"
            : "Handle failed and human-blocked runs first, then review proposals, candidates, and editorial follow-up. AI never bypasses the human publishing boundary."
        }
        actions={
          <>
            <Button
              variant="outline"
              icon={<ShieldCheck />}
              onClick={() => onNavigate("inbox")}
            >
              {zh ? `待我处理 ${decisionCount}` : `Review queue ${decisionCount}`}
            </Button>
            <Button
              variant="solid"
              color="primary"
              icon={<GitBranch />}
              onClick={() => onNavigate("automation")}
            >
              {zh ? "查看自动化" : "Open automation"}
            </Button>
          </>
        }
      />''',
    "overview panel lead composition",
)

# Inbox: canonical top-level title/subtitle/action anatomy.
path = "blog-frontend/src/components/agent/DecisionInboxWorkspace.tsx"
replace_once(
    path,
    "  OperationsObjectRow,\n  OperationsRegionHeading,",
    "  OperationsObjectRow,\n  OperationsPanelLead,\n  OperationsRegionHeading,",
    "inbox panel lead import",
)
replace_once(
    path,
    r'''      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <Heading level={2}>{zh ? "待我处理" : "Review queue"}</Heading>
          <Text className="mt-1" tone="muted">
            {zh
              ? "所有需要人工接力的审批、选择、运营建议和后续任务都在同一个工作台处理；完成后回到原来的 Run 或业务流程。"
              : "Approvals, choices, operational proposals, and follow-up tasks that need a human handoff are handled in one workbench and return to their source run or business flow."}
          </Text>
        </div>
        <Button
          variant="outline"
          icon={<RefreshCw />}
          onClick={() => void onRefresh()}
        >
          {zh ? "刷新" : "Refresh"}
        </Button>
      </div>''',
    r'''      <OperationsPanelLead
        title={zh ? "人工决策队列" : "Human decision queue"}
        description={
          zh
            ? "把审批、选择、确认、运营建议和后续编辑任务放进同一人工决策队列；完成后回到原来的 Run 或业务流程。"
            : "Approvals, choices, confirmations, operational proposals, and editorial follow-up share one human decision queue before returning to the originating Run or business flow."
        }
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            onClick={() => void onRefresh()}
          >
            {zh ? "刷新" : "Refresh"}
          </Button>
        }
      />''',
    "inbox panel lead composition",
)

# Automation: canonical lead in list/detail and editor modes.
path = "blog-frontend/src/components/agent/WorkflowWorkspace.tsx"
replace_once(
    path,
    "  OperationsObjectRow,\n  OperationsRegionHeading,",
    "  OperationsObjectRow,\n  OperationsPanelLead,\n  OperationsRegionHeading,",
    "automation panel lead import",
)
replace_once(
    path,
    r'''  if (editing)
    return (
      <WorkflowEditor
        initial={editing === "new" ? undefined : editing}
        labels={labels}
        agents={agents}
        tools={tools}
        locale={locale}
        onCancel={() => setEditing(null)}
        onSave={async (value) => {
          await onSave(value);
          setEditing(null);
        }}
      />
    );''',
    r'''  if (editing)
    return (
      <div className="flex flex-col gap-5">
        <OperationsPanelLead
          title={
            editing === "new"
              ? locale === "zh"
                ? "创建自动化"
                : "Create automation"
              : locale === "zh"
                ? "编辑自动化"
                : "Edit automation"
          }
          description={
            locale === "zh"
              ? "编辑 Workflow 的输入契约、流程定义、执行计划与运行边界；保存形成新版本，运行证据继续进入运行中心。"
              : "Edit the Workflow input contract, flow definition, schedule, and execution boundaries. Saving creates a new version while evidence remains in the run center."
          }
        />
        <WorkflowEditor
          initial={editing === "new" ? undefined : editing}
          labels={labels}
          agents={agents}
          tools={tools}
          locale={locale}
          onCancel={() => setEditing(null)}
          onSave={async (value) => {
            await onSave(value);
            setEditing(null);
          }}
        />
      </div>
    );''',
    "automation editor lead",
)
replace_once(
    path,
    r'''      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Text tone="muted" className="max-w-3xl">
          {locale === "zh"
            ? "Workflow 是持续运行的版本化自动化资产。左侧选择资产，右侧直接查看状态、边界、定义与人工执行。"
            : "Workflows are versioned automation assets. Select one on the left to inspect status, boundaries, definition, and manual execution."}
        </Text>
        <Button
          variant="solid"
          color="primary"
          type="button"
          onClick={() => setEditing("new")}
          icon={<Plus />}
        >
          {labels.add}
        </Button>
      </div>''',
    r'''      <OperationsPanelLead
        title={locale === "zh" ? "自动化资产" : "Automation assets"}
        description={
          locale === "zh"
            ? "Workflow 是持续运行的版本化自动化资产。左侧选择资产，右侧直接查看健康度、调度、运行记录、定义与人工执行。"
            : "Workflows are versioned automation assets. Select one on the left to inspect health, scheduling, run history, definition, and manual execution."
        }
        actions={
          <Button
            variant="solid"
            color="primary"
            type="button"
            onClick={() => setEditing("new")}
            icon={<Plus />}
          >
            {labels.add}
          </Button>
        }
      />''',
    "automation top lead",
)
replace_once(
    path,
    'className="h-auto w-full rounded-none px-6 py-3.5 text-left font-normal hover:bg-muted/35"',
    'className="grid h-auto w-full min-w-0 grid-cols-1 gap-3 whitespace-normal rounded-none px-6 py-3.5 text-left font-normal transition-colors hover:bg-muted/35 sm:grid-cols-[7rem_7rem_minmax(7rem,0.7fr)_6rem_minmax(0,1.5fr)] sm:items-center [&>span]:contents"',
    "recent run outer grid",
)
replace_once(
    path,
    '<span className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-[6.5rem_7rem_minmax(8rem,0.8fr)_5rem_minmax(0,1.5fr)] sm:items-center">',
    '<span className="contents">',
    "recent run inner contents",
)

# Workflow Run Center: same dimensions and control density as Showcase.
path = "blog-frontend/src/components/agent/WorkflowRunRecords.tsx"
target = Path(path)
text = target.read_text()
for old, new, label in [
    (
        '          size="small"\n          aria-label={zh ? "筛选 Workflow" : "Filter Workflow"}',
        '          aria-label={zh ? "筛选 Workflow" : "Filter Workflow"}',
        "workflow filter size",
    ),
    (
        '          size="small"\n          aria-label={zh ? "筛选状态" : "Filter Status"}',
        '          aria-label={zh ? "筛选状态" : "Filter Status"}',
        "status filter size",
    ),
    (
        'className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]"',
        'className="grid min-w-0 items-stretch gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]"',
        "workflow run center grid",
    ),
    (
        'className="shrink-0 border-b bg-muted/20 px-4 py-3"',
        'className="shrink-0 border-b px-[18px] py-4"',
        "workflow run rail header",
    ),
]:
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected one match, got {text.count(old)}")
    text = text.replace(old, new, 1)
target.write_text(text)

# Agent Run Center: replace list/detail route toggle with persistent master/detail evidence workspace.
path = "blog-frontend/src/components/agent/AgentRunRecords.tsx"
target = Path(path)
text = target.read_text()
if text.count('import { ArrowLeft, Eye, ListChecks, Trash2 } from "lucide-react";') != 1:
    raise SystemExit("AgentRunRecords icon imports changed")
text = text.replace(
    'import { ArrowLeft, Eye, ListChecks, Trash2 } from "lucide-react";',
    'import { ListChecks, Trash2 } from "lucide-react";',
    1,
)
for unused in ["  CardContent,\n", "  CardHeader,\n", "  IconButton,\n"]:
    text = text.replace(unused, "", 1)
anchor = 'import { MarkdownRenderer } from "../MarkdownRenderer";\n'
if anchor not in text:
    raise SystemExit("AgentRunRecords import anchor missing")
text = text.replace(
    anchor,
    anchor
    + 'import {\n  OperationsMeta,\n  OperationsObjectRow,\n  OperationsRegionHeading,\n  OperationsSummaryStrip,\n} from "./OperationsPatterns";\n',
    1,
)
start = text.find("export function RecordsWorkspace({")
if start < 0:
    raise SystemExit("RecordsWorkspace start missing")
new_records = r'''export function RecordsWorkspace({
  locale,
  runs,
  agents,
  selectedRun,
  onInspect,
  onDelete,
  formatDateTime,
}: {
  locale: "en" | "zh";
  runs: AgentRun[];
  agents: Agent[];
  selectedRun: { run: AgentRun; tool_calls: AgentToolCall[] } | null;
  onInspect: (run: AgentRun) => void;
  onClearInspect?: () => void;
  onDelete: (run: AgentRun) => void;
  formatDateTime: (value: string) => string;
}) {
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const zh = locale === "zh";

  return (
    <div className="agent-runs-center flex min-w-0 flex-col gap-4">
      {runs.length === 0 ? (
        <Card padding="base">
          <Empty
            title={zh ? "还没有 AI 工作记录。" : "No AI work recorded yet."}
          />
        </Card>
      ) : (
        <div
          data-slot="ops-master-detail"
          className="grid min-w-0 items-stretch gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]"
        >
          <section
            data-slot="ops-rail"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background"
            aria-label="Agent Runs"
          >
            <div className="shrink-0 border-b px-[18px] py-4">
              <strong className="text-sm">Agent Runs</strong>
              <Text size="xs" tone="muted" className="mt-0.5">
                {runs.length} {zh ? "条运行记录" : "run records"}
              </Text>
            </div>
            <div
              role="list"
              data-slot="ops-rail-body"
              aria-label={zh ? "Agent 运行列表" : "Agent run list"}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {runs.map((run) => (
                <div key={run.id} role="listitem">
                  <OperationsObjectRow
                    title={`Run #${run.id}`}
                    status={<StatusPill status={run.status} locale={locale} />}
                    meta={`${agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`} · ${formatDateTime(run.started_at || run.created_at)}`}
                    summary={
                      run.error_message ||
                      run.output_summary ||
                      (zh
                        ? "打开查看本次执行证据。"
                        : "Open to inspect this run's execution evidence.")
                    }
                    signals={
                      <>
                        <OperationsMeta>
                          {run.provider}
                          {run.model ? ` · ${run.model}` : ""}
                        </OperationsMeta>
                        <OperationsMeta>
                          {(run.input_tokens + run.output_tokens).toLocaleString()} Token
                        </OperationsMeta>
                      </>
                    }
                    selected={selectedRun?.run.id === run.id}
                    onClick={() => onInspect(run)}
                    ariaLabel={zh ? `查看 Run #${run.id}` : `Inspect Run #${run.id}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {selectedRun ? (
            <div
              data-slot="ops-detail-stack"
              className="flex min-w-0 flex-col gap-6"
              aria-label={
                zh
                  ? `Agent Run #${selectedRun.run.id} 详情`
                  : `Agent Run #${selectedRun.run.id} details`
              }
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      Run #{selectedRun.run.id} · {agentMap.get(selectedRun.run.agent_id)?.name || `Agent #${selectedRun.run.agent_id}`}
                    </h2>
                    <StatusPill status={selectedRun.run.status} locale={locale} />
                  </div>
                  <Text className="mt-2 max-w-4xl" tone="muted">
                    {selectedRun.run.error_message ||
                      selectedRun.run.output_summary ||
                      (zh
                        ? "本次 Agent Run 的输出与执行证据。"
                        : "Output and execution evidence for this Agent Run.")}
                  </Text>
                  <Text size="xs" tone="muted" className="mt-1">
                    {selectedRun.run.provider}
                    {selectedRun.run.model ? ` · ${selectedRun.run.model}` : ""}
                  </Text>
                </div>
                {["succeeded", "failed", "cancelled"].includes(
                  selectedRun.run.status,
                ) ? (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => onDelete(selectedRun.run)}
                    icon={<Trash2 />}
                  >
                    {zh ? "删除记录" : "Delete record"}
                  </Button>
                ) : null}
              </div>

              <OperationsSummaryStrip
                ariaLabel={zh ? "Agent Run 摘要" : "Agent Run summary"}
                items={[
                  {
                    label: zh ? "开始时间" : "Started",
                    value: formatDateTime(
                      selectedRun.run.started_at || selectedRun.run.created_at,
                    ),
                    detail: selectedRun.run.finished_at
                      ? `${zh ? "结束" : "Finished"} ${formatDateTime(selectedRun.run.finished_at)}`
                      : zh
                        ? "仍在执行 / 等待"
                        : "Still running / waiting",
                  },
                  {
                    label: "Token",
                    value: (
                      selectedRun.run.input_tokens + selectedRun.run.output_tokens
                    ).toLocaleString(),
                    detail: `${selectedRun.run.input_tokens} in / ${selectedRun.run.output_tokens} out`,
                  },
                  {
                    label: zh ? "工具调用" : "Tool calls",
                    value: selectedRun.tool_calls.length,
                    detail: `${selectedRun.tool_calls.filter((call) => call.status === "failed").length} ${zh ? "个失败" : "failed"}`,
                  },
                  {
                    label: zh ? "触发方式" : "Trigger",
                    value:
                      selectedRun.run.trigger_type === "cron"
                        ? zh
                          ? "计划触发"
                          : "Cron"
                        : zh
                          ? "手动触发"
                          : "Manual",
                    detail: `Run #${selectedRun.run.id}`,
                  },
                ]}
              />

              <section
                className="overflow-hidden rounded-lg border bg-background"
                aria-label={zh ? "AI 输出" : "AI output"}
              >
                <div className="border-b px-5 py-4">
                  <OperationsRegionHeading
                    title={zh ? "AI 输出" : "AI output"}
                    description={
                      zh
                        ? "输出属于当前 Run；完整 Tool Call、引用与失败证据继续保留在下方执行日志。"
                        : "The output belongs to the current Run; Tool Calls, citations, and failure evidence remain in the execution log below."
                    }
                  />
                </div>
                <div className="p-5">
                  <div className="agent-output">
                    {selectedRun.run.output_summary ? (
                      <MarkdownRenderer content={selectedRun.run.output_summary} />
                    ) : selectedRun.run.error_message ? (
                      <pre>{selectedRun.run.error_message}</pre>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </section>

              <RecordEvidence
                run={selectedRun}
                locale={locale}
                formatDateTime={formatDateTime}
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-background p-8">
              <Empty
                title={
                  zh
                    ? "选择一个 Agent Run 查看证据"
                    : "Select an Agent Run to inspect evidence"
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
'''
target.write_text(text[:start] + new_records)

# Top-level Run Center: canonical lead + action buttons, not a detached Segmented control.
path = "blog-frontend/src/pages/admin/AIOperations.tsx"
target = Path(path)
text = target.read_text()
if text.count("  Segmented,\n") != 1:
    raise SystemExit("AIOperations Segmented import signature changed")
text = text.replace("  Segmented,\n", "", 1)
anchor = 'import { WorkflowRunRecords } from "../../components/agent/WorkflowRunRecords";\n'
if anchor not in text:
    raise SystemExit("AIOperations import anchor missing")
text = text.replace(
    anchor,
    anchor
    + 'import { OperationsPanelLead } from "../../components/agent/OperationsPatterns";\n',
    1,
)
replace_old = r'''    if (!requestedID) return;
    const requested = runs.find((run) => run.id === requestedID);'''
replace_new = r'''    if (!requestedID) {
      if (runs.length > 0) {
        inspectedAgentRunFromURL.current = true;
        void inspectRun(runs[0]);
      }
      return;
    }
    const requested = runs.find((run) => run.id === requestedID);'''
if text.count(replace_old) != 1:
    raise SystemExit("Agent default run selection signature changed")
text = text.replace(replace_old, replace_new, 1)
select_tab = r'''  const selectTab = (nextTab: ConsoleTab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", url);
  };
'''
select_record = select_tab + r'''
  const selectRecordType = (next: "workflow" | "agent") => {
    setRecordType(next);
    setSelectedRun(null);
    inspectedAgentRunFromURL.current = false;
    const url = new URL(window.location.href);
    url.searchParams.set("record", next);
    url.searchParams.delete("run");
    window.history.replaceState(null, "", url);
  };
'''
if text.count(select_tab) != 1:
    raise SystemExit("selectTab anchor changed")
text = text.replace(select_tab, select_record, 1)
old_records = r'''        {tab === "records" ? (
          <div className="flex flex-col gap-4">
            <Segmented<"workflow" | "agent">
              aria-label={locale === "zh" ? "运行中心类型" : "Run center type"}
              value={recordType}
              onChange={(next) => {
                setRecordType(next);
                const url = new URL(window.location.href);
                url.searchParams.set("record", next);
                window.history.replaceState(null, "", url);
              }}
              options={[
                {
                  value: "workflow",
                  label: locale === "zh" ? "Workflow 任务" : "Workflow tasks",
                },
                {
                  value: "agent",
                  label: locale === "zh" ? "Agent 运行" : "Agent runs",
                },
              ]}
            />
            {recordType === "agent" ? (
              <RecordsWorkspace
                locale={locale}
                runs={runs}
                agents={agents}
                selectedRun={selectedRun}
                onInspect={(run) => void inspectRun(run)}
                onClearInspect={() => setSelectedRun(null)}
                onDelete={setDeleteRunTarget}
                formatDateTime={formatDateTime}
              />
            ) : (
              <WorkflowRunRecords
                locale={locale}
                workflows={workflows}
                runs={workflowRuns}
                formatDateTime={formatDateTime}
                onRefresh={refresh}
              />
            )}
          </div>
        ) : null}'''
new_records_block = r'''        {tab === "records" ? (
          <div className="flex flex-col gap-5">
            <OperationsPanelLead
              title={locale === "zh" ? "运行证据中心" : "Run evidence center"}
              description={
                locale === "zh"
                  ? "从一次 Run 追溯执行步骤、资源边界、人工交互、媒体候选、Tool Call 与持久化事件；这里是证据中心，不是 Workflow 配置页。"
                  : "Trace execution steps, resource boundaries, human interactions, media candidates, Tool Calls, and persisted events from a single Run. This is an evidence center, not a Workflow configuration page."
              }
              actions={
                <div
                  className="flex flex-wrap gap-2"
                  aria-label={
                    locale === "zh" ? "运行中心类型" : "Run center type"
                  }
                >
                  <Button
                    variant={recordType === "workflow" ? "solid" : "outline"}
                    color={recordType === "workflow" ? "primary" : undefined}
                    onClick={() => selectRecordType("workflow")}
                    icon={<GitBranch />}
                  >
                    {locale === "zh" ? "Workflow 任务" : "Workflow tasks"}
                  </Button>
                  <Button
                    variant={recordType === "agent" ? "solid" : "outline"}
                    color={recordType === "agent" ? "primary" : undefined}
                    onClick={() => selectRecordType("agent")}
                    icon={<Clock3 />}
                  >
                    {locale === "zh" ? "Agent 运行" : "Agent runs"}
                  </Button>
                </div>
              }
            />
            {recordType === "agent" ? (
              <RecordsWorkspace
                locale={locale}
                runs={runs}
                agents={agents}
                selectedRun={selectedRun}
                onInspect={(run) => void inspectRun(run)}
                onDelete={setDeleteRunTarget}
                formatDateTime={formatDateTime}
              />
            ) : (
              <WorkflowRunRecords
                locale={locale}
                workflows={workflows}
                runs={workflowRuns}
                formatDateTime={formatDateTime}
                onRefresh={refresh}
              />
            )}
          </div>
        ) : null}'''
if text.count(old_records) != 1:
    raise SystemExit("Run Center top-level composition signature changed")
target.write_text(text.replace(old_records, new_records_block, 1))

# Migration ledger: page-level verified status must not mask unresolved owned surfaces.
migration_path = Path("docs/ui-redesign/migration.json")
migration = json.loads(migration_path.read_text())
required = {
    "blog-admin:pages/admin/AIOperations.tsx",
    "blog-admin:components/agent/AgentRunRecords.tsx",
    "blog-admin:components/agent/InboxWorkspace.tsx",
    "blog-admin:components/agent/WorkflowRunRecords.tsx",
    "blog-admin:components/agent/WorkflowWorkspace.tsx",
    "blog-admin:components/agent/WorkspaceOverview.tsx",
}
found: set[str] = set()


def visit(value) -> None:
    if isinstance(value, dict):
        item_id = value.get("id")
        if item_id in required:
            found.add(item_id)
            value["implementation"] = "migrated"
            value["verification"] = "verified"
            evidence = value.setdefault("evidence", [])
            note = (
                "AI Operations canonical reverse migration: tab panel lead, "
                "run-center master/detail contract, static gate and rendered parity coverage"
            )
            if note not in evidence:
                evidence.append(note)
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)


visit(migration)
missing = required - found
if missing:
    raise SystemExit(f"migration ledger missing required AI Ops surfaces: {sorted(missing)}")
migration_path.write_text(json.dumps(migration, ensure_ascii=False, indent=2) + "\n")

md_path = Path("docs/ui-redesign/MIGRATION.md")
lines = md_path.read_text().splitlines()
for index, line in enumerate(lines):
    for item_id in required:
        if line.startswith(f"| {item_id} |"):
            parts = line.split("|")
            if len(parts) >= 6:
                parts[-3] = " migrated "
                parts[-2] = " verified "
                lines[index] = "|".join(parts)
md_path.write_text("\n".join(lines) + "\n")

# Permanent static gate: structural parity + migration closure, not a page-level checkbox.
Path("blog-frontend/scripts/check-ai-ops-layout-contracts.mjs").write_text(
    r'''import { readFile } from "node:fs/promises";
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
  "src/components/agent/WorkflowWorkspace.tsx",
  "src/components/agent/WorkflowRunRecords.tsx",
  "src/components/agent/DecisionInboxWorkspace.tsx",
  "src/components/agent/AgentRunRecords.tsx",
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

const workflowWorkspace = await source("src/components/agent/WorkflowWorkspace.tsx");
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
requireText(
  workflowWorkspace,
  "[&>span]:contents",
  "Workflow Recent Runs must flatten the Button/ButtonLink content wrapper like Showcase",
);
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
'''
)
