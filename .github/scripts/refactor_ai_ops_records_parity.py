from pathlib import Path


def add_import(text: str, marker: str, replacement: str, label: str) -> str:
    if replacement in text:
        return text
    if marker not in text:
        raise SystemExit(f"{label} import marker not found")
    return text.replace(marker, replacement, 1)


# Agent run records list: keep detail/evidence behavior, replace only the historical table list.
agent_path = Path("blog-frontend/src/components/agent/AgentRunRecords.tsx")
agent = agent_path.read_text()
agent = agent.replace(
    'import { Button, Card, CardHeader, Empty, IconButton } from "@gouno/ui/core";',
    'import { Button, Card, CardContent, CardHeader, Empty, IconButton, Text } from "@gouno/ui/core";',
    1,
)
agent_start_marker = '  return (\n    <div className="agent-runs-list-view section-stack">'
agent_start = agent.find(agent_start_marker)
if agent_start < 0:
    raise SystemExit("Agent runs list start not found")
agent_end_marker = '\n    </div>\n  );\n}'
agent_end = agent.find(agent_end_marker, agent_start)
if agent_end < 0:
    raise SystemExit("Agent runs list end not found")
agent_end += len('\n    </div>')
agent_block = '''  return (
    <div className="agent-runs-list-view flex flex-col gap-5">
      {runs.length === 0 ? (
        <Card padding="base">
          <Empty
            title={zh ? "还没有 AI 工作记录。" : "No AI work recorded yet."}
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <CardContent className="p-0">
            <div
              role="list"
              aria-label={zh ? "Agent 运行列表" : "Agent run list"}
              className="divide-y"
            >
              {runs.map((run) => (
                <div
                  key={run.id}
                  role="listitem"
                  className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onInspect(run)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>
                        {agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`}
                      </strong>
                      <StatusPill status={run.status} locale={locale} />
                      <Text size="xs" tone="muted">Run #{run.id}</Text>
                    </div>
                    <Text size="sm" tone="muted" className="mt-2">
                      {run.provider} · {run.model}
                    </Text>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <span>{run.input_tokens + run.output_tokens} tokens</span>
                      <span>
                        {run.trigger_type === "cron"
                          ? zh
                            ? "计划触发"
                            : "Cron"
                          : zh
                            ? "手动触发"
                            : "Manual"}
                      </span>
                      <span>{formatDateTime(run.created_at)}</span>
                      <span>{zh ? "查看本次运行的结果与执行依据" : "Inspect results and execution evidence"}</span>
                    </div>
                  </button>
                  <div className="flex min-w-max shrink-0 flex-nowrap items-center gap-1">
                    <IconButton
                      label={zh ? "查看详情" : "Inspect"}
                      icon={<Eye />}
                      variant="ghost"
                      onClick={() => onInspect(run)}
                    />
                    {["succeeded", "failed", "cancelled"].includes(run.status) ? (
                      <IconButton
                        variant="ghost"
                        color="error"
                        label={zh ? "删除记录" : "Delete record"}
                        icon={<Trash2 />}
                        onClick={() => onDelete(run)}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>'''
agent = agent[:agent_start] + agent_block + agent[agent_end:]
if "content-table agent-table agent-runs-table" in agent:
    raise SystemExit("legacy Agent run table remains")
agent_path.write_text(agent)


# Workflow run records list: preserve detail, inspect, cancel/delete/retry and media interactions.
workflow_path = Path("blog-frontend/src/components/agent/WorkflowRunRecords.tsx")
workflow = workflow_path.read_text()
workflow = workflow.replace(
    'import { Alert, Button, Card, Empty, IconButton, Select } from "@gouno/ui/core";',
    'import { Alert, Button, Card, CardContent, Empty, IconButton, Select, Text } from "@gouno/ui/core";',
    1,
)
workflow_start_marker = '        <div className="workflow-runs-list-view section-stack">'
workflow_start = workflow.find(workflow_start_marker)
if workflow_start < 0:
    raise SystemExit("Workflow runs list start not found")
workflow_end_marker = '\n        </div>\n      )}\n      {previewDialogCandidate'
workflow_end = workflow.find(workflow_end_marker, workflow_start)
if workflow_end < 0:
    raise SystemExit("Workflow runs list end not found")
workflow_end += len('\n        </div>')
workflow_block = '''        <div className="workflow-runs-list-view flex flex-col gap-5">
          <Card padding="base">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 lg:w-64">
                <Select
                  size="small"
                  aria-label={zh ? "筛选 Workflow" : "Filter Workflow"}
                  value={String(workflowID)}
                  onChange={(nextValue) => {
                    setWorkflowID(Number(nextValue));
                    setSelected(null);
                  }}
                >
                  <option value="0">{zh ? "全部 Workflow" : "All Workflows"}</option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={String(workflow.id)}>
                      {workflow.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0 lg:w-56">
                <Select
                  size="small"
                  aria-label={zh ? "筛选状态" : "Filter Status"}
                  value={statusFilter}
                  onChange={(nextValue) => setStatusFilter(String(nextValue))}
                >
                  <option value="all">{zh ? "全部状态" : "All Status"}</option>
                  <option value="succeeded">{zh ? "成功" : "Succeeded"}</option>
                  <option value="failed">{zh ? "失败" : "Failed"}</option>
                  <option value="running">{zh ? "执行中" : "Running / Queued"}</option>
                  <option value="awaiting">{zh ? "等待处理 / 审批" : "Awaiting user / approval"}</option>
                </Select>
              </div>
              <div className="flex flex-1 items-center justify-between gap-3 lg:justify-end">
                <Text size="sm" tone="muted" className="whitespace-nowrap">
                  {filtered.length} {zh ? "条记录" : "runs"}
                </Text>
                {workflowID !== 0 || statusFilter !== "all" ? (
                  <Button
                    variant="text"
                    size="small"
                    type="button"
                    onClick={() => {
                      setWorkflowID(0);
                      setStatusFilter("all");
                    }}
                    icon={<X />}
                  >
                    {zh ? "清除" : "Clear"}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
          {filtered.length === 0 ? (
            <Card padding="base">
              <Empty
                title={zh ? "还没有 Workflow 运行记录。" : "No Workflow runs recorded yet."}
              />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <CardContent className="p-0">
                <div
                  role="list"
                  aria-label={zh ? "Workflow 运行列表" : "Workflow run list"}
                  className="divide-y"
                >
                  {filtered.map((run) => {
                    const runType = run.dry_run
                      ? zh
                        ? "试运行"
                        : "Dry-run"
                      : run.schedule_key
                        ? zh
                          ? `计划 ${run.schedule_key}`
                          : `Scheduled ${run.schedule_key}`
                        : zh
                          ? "手动运行"
                          : "Manual";
                    return (
                      <div
                        key={run.id}
                        role="listitem"
                        className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void inspect(run)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>
                              {names.get(run.workflow_id) || `Workflow #${run.workflow_id}`}
                            </strong>
                            <StatusPill status={run.status} locale={locale} />
                            <Text size="xs" tone="muted">
                              Run #{run.id} · v{run.workflow_version_id}
                            </Text>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                            <span>{runType}</span>
                            <span>{formatDateTime(run.started_at || run.created_at)}</span>
                            <span>{duration(run.started_at, run.finished_at)}</span>
                            <span>{zh ? "查看步骤、资源与交互证据" : "Inspect steps, resources, and interactions"}</span>
                          </div>
                        </button>
                        <div className="flex min-w-max shrink-0 flex-nowrap items-center gap-1">
                          <IconButton
                            label={zh ? "查看详情" : "Inspect"}
                            icon={<Eye />}
                            variant="ghost"
                            disabled={loadingID === run.id}
                            onClick={() => void inspect(run)}
                          />
                          {["queued", "running", "awaiting_approval", "waiting_for_user"].includes(run.status) ? (
                            <IconButton
                              variant="ghost"
                              color="error"
                              label={zh ? "放弃/终止运行" : "Cancel run"}
                              icon={<Ban />}
                              disabled={cancelling}
                              onClick={() => void cancelRunByID(run)}
                            />
                          ) : null}
                          {["succeeded", "failed", "cancelled"].includes(run.status) ? (
                            <IconButton
                              variant="ghost"
                              color="error"
                              label={zh ? "删除记录" : "Delete record"}
                              icon={<Trash2 />}
                              disabled={deleting}
                              onClick={() => void deleteRunByID(run)}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>'''
workflow = workflow[:workflow_start] + workflow_block + workflow[workflow_end:]
if "content-table agent-table workflow-runs-table" in workflow:
    raise SystemExit("legacy Workflow run table remains")
workflow_path.write_text(workflow)


# Add focused presentation regression tests without weakening existing behavior coverage.
workflow_test_path = Path("blog-frontend/src/components/agent/__tests__/WorkflowRunRecords.test.tsx")
workflow_test = workflow_test_path.read_text()
workflow_insert = '''

  it("renders the Workflow run collection as a canonical list surface", () => {
    render(
      <WorkflowRunRecords
        locale="zh"
        workflows={[workflow]}
        runs={[run]}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByRole("list", { name: "Workflow 运行列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
'''
workflow_pos = workflow_test.rfind("\n});")
if workflow_pos < 0:
    raise SystemExit("WorkflowRunRecords test suite end not found")
workflow_test = workflow_test[:workflow_pos] + workflow_insert + workflow_test[workflow_pos:]
workflow_test_path.write_text(workflow_test)

agent_test_path = Path("blog-frontend/src/components/agent/__tests__/AgentRunRecords.test.tsx")
if not agent_test_path.exists():
    agent_test_path.write_text('''import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordsWorkspace } from "../AgentRunRecords";

const agent = {
  id: 3,
  name: "Operations Agent",
  description: "Ops",
  enabled: true,
  trigger_type: "manual",
  timezone: "Asia/Shanghai",
  daily_run_limit: 10,
  monthly_token_budget: 100000,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const run = {
  id: 9,
  agent_id: 3,
  status: "succeeded",
  trigger_type: "manual",
  provider: "OpenAI",
  model: "gpt-5-mini",
  input_tokens: 120,
  output_tokens: 80,
  created_at: "2026-08-01T01:00:00Z",
};

describe("RecordsWorkspace", () => {
  it("renders Agent runs as a canonical list and preserves inspect/delete actions", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    const onDelete = vi.fn();

    render(
      <RecordsWorkspace
        locale="zh"
        runs={[run]}
        agents={[agent]}
        selectedRun={null}
        onInspect={onInspect}
        onClearInspect={vi.fn()}
        onDelete={onDelete}
        formatDateTime={(value) => value}
      />,
    );

    expect(screen.getByRole("list", { name: "Agent 运行列表" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看详情" }));
    expect(onInspect).toHaveBeenCalledWith(run);
    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(onDelete).toHaveBeenCalledWith(run);
  });
});
''')
