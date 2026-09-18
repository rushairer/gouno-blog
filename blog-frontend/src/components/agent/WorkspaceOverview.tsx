import { AlertTriangle, GitBranch, ShieldCheck } from "lucide-react";
import type {
  AgentApproval,
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowRun,
} from "../../types/agent";
import { Button, Empty, Tag } from "@gouno/ui/core";
import {
  OperationsMeta,
  OperationsObjectRow,
  OperationsPanelLead,
  OperationsRegionHeading,
  OperationsSummaryStrip,
} from "./OperationsPatterns";

export type ConsoleTab = "overview" | "inbox" | "automation" | "records";

interface WorkspaceOverviewProps {
  locale: "en" | "zh";
  approvals: AgentApproval[];
  interactions?: WorkflowInteractionTask[];
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates: MediaCandidate[];
  workflows: Workflow[];
  workflowRuns?: WorkflowRun[];
  workflowMetrics?: WorkflowMetric[];
  editorialTasks?: EditorialTask[];
  formatDateTime?: (value?: string) => string;
  onNavigate: (tab: ConsoleTab) => void;
}

function runStatusLabel(status: string, zh: boolean) {
  if (status === "failed") return zh ? "失败" : "Failed";
  if (status === "waiting_for_user")
    return zh ? "等待用户" : "Waiting for user";
  if (status === "awaiting_approval")
    return zh ? "等待审批" : "Awaiting approval";
  if (status === "running") return zh ? "运行中" : "Running";
  if (status === "queued") return zh ? "已排队" : "Queued";
  if (status === "cancelled") return zh ? "已取消" : "Cancelled";
  return zh ? "成功" : "Succeeded";
}

function RunStatus({ status, zh }: { status: string; zh: boolean }) {
  const label = runStatusLabel(status, zh);
  if (status === "failed") return <Tag color="error">{label}</Tag>;
  if (status === "waiting_for_user" || status === "awaiting_approval") {
    return <Tag color="warning">{label}</Tag>;
  }
  if (status === "running" || status === "queued") {
    return <Tag color="primary">{label}</Tag>;
  }
  if (status === "succeeded") return <Tag color="success">{label}</Tag>;
  return <Tag>{label}</Tag>;
}

function totalTokens(run: WorkflowRun) {
  return (run.input_tokens || 0) + (run.output_tokens || 0);
}

export function WorkspaceOverview({
  locale,
  approvals,
  interactions = [],
  suggestions,
  candidateSets,
  mediaCandidates,
  workflows,
  workflowRuns = [],
  workflowMetrics = [],
  editorialTasks = [],
  formatDateTime = (value) => value || "—",
  onNavigate,
}: WorkspaceOverviewProps) {
  const zh = locale === "zh";
  const pendingInteractions = interactions.filter(
    (item) => item.status === "pending",
  ).length;
  const actionableApprovals = approvals.filter(
    (item) => item.status === "pending" || item.status === "failed",
  ).length;
  const actionableSuggestions = suggestions.filter(
    (item) => item.status === "new",
  ).length;
  const pendingCandidates = candidateSets.filter(
    (item) => item.status === "pending",
  ).length;
  const actionableMedia = mediaCandidates.filter(
    (item) =>
      !item.workflow_run_id &&
      ["brief_ready", "ready_to_generate"].includes(item.generation_status),
  ).length;
  const openEditorialTasks = editorialTasks.filter(
    (item) => item.status === "open",
  ).length;
  const decisionCount =
    pendingInteractions +
    actionableApprovals +
    actionableSuggestions +
    pendingCandidates +
    actionableMedia +
    openEditorialTasks;

  const activeRuns = workflowRuns.filter((run) =>
    ["queued", "running"].includes(run.status),
  ).length;
  const failedRuns = workflowRuns.filter(
    (run) => run.status === "failed",
  ).length;
  const waitingRuns = workflowRuns.filter((run) =>
    ["waiting_for_user", "awaiting_approval"].includes(run.status),
  ).length;
  const tokenUsage = workflowRuns.reduce(
    (total, run) => total + totalTokens(run),
    0,
  );
  const attentionRuns = workflowRuns
    .filter((run) =>
      ["failed", "waiting_for_user", "awaiting_approval"].includes(run.status),
    )
    .slice(0, 4);
  const metricsByWorkflow = new Map(
    workflowMetrics.map((metric) => [metric.workflow_id, metric]),
  );
  const workflowByID = new Map(
    workflows.map((workflow) => [workflow.id, workflow]),
  );
  const latestRunByWorkflow = new Map<number, WorkflowRun>();
  for (const run of workflowRuns) {
    if (!latestRunByWorkflow.has(run.workflow_id)) {
      latestRunByWorkflow.set(run.workflow_id, run);
    }
  }

  return (
    <div
      className="flex flex-col gap-6"
      aria-label={zh ? "AI 运营概览" : "AI operations overview"}
    >
      <OperationsPanelLead
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
              {zh
                ? `待我处理 ${decisionCount}`
                : `Review queue ${decisionCount}`}
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
      />

      <OperationsSummaryStrip
        ariaLabel={zh ? "AI 运营健康度" : "AI operations health"}
        items={[
          {
            label: zh ? "执行中" : "Active runs",
            value: activeRuns,
            detail: "queued / running",
          },
          {
            label: zh ? "失败运行" : "Failed runs",
            value: failedRuns,
            detail: failedRuns
              ? zh
                ? "优先查看失败证据"
                : "Inspect failure evidence first"
              : zh
                ? "暂无失败"
                : "No failures",
          },
          {
            label: zh ? "等待人工" : "Human attention",
            value: waitingRuns + decisionCount,
            detail: zh
              ? `${decisionCount} 项在决策队列`
              : `${decisionCount} items in the decision queue`,
          },
          {
            label: "Token",
            value: tokenUsage.toLocaleString(),
            detail: zh
              ? "当前已加载 Workflow Run 合计"
              : "Loaded Workflow Runs total",
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <section
          className="overflow-hidden rounded-lg border bg-background"
          aria-label={zh ? "需要关注" : "Needs attention"}
        >
          <div className="border-b px-5 py-4">
            <OperationsRegionHeading
              title={zh ? "需要关注" : "Needs attention"}
              description={
                zh
                  ? "失败、等待审批和等待输入的 Run 优先于普通成功记录。"
                  : "Failed runs and runs waiting for approval or input come before ordinary success records."
              }
              action={
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => onNavigate("records")}
                >
                  {zh ? "进入运行中心" : "Open run center"}
                </Button>
              }
            />
          </div>
          <div>
            {attentionRuns.length ? (
              attentionRuns.map((run) => {
                const workflow = workflowByID.get(run.workflow_id);
                return (
                  <OperationsObjectRow
                    key={run.id}
                    leading={<AlertTriangle className="size-4" />}
                    title={`Run #${run.id}${workflow ? ` · ${workflow.name}` : ""}`}
                    status={<RunStatus status={run.status} zh={zh} />}
                    meta={`${formatDateTime(run.started_at || run.created_at)} · v${workflow?.current_version ?? "—"}`}
                    summary={
                      run.error_message ||
                      (zh
                        ? "查看本次执行证据。"
                        : "Inspect this run's execution evidence.")
                    }
                    signals={
                      <>
                        {run.dry_run ? <Tag>Dry-run</Tag> : null}
                        <OperationsMeta>
                          {totalTokens(run).toLocaleString()} Token
                        </OperationsMeta>
                      </>
                    }
                    onClick={() => onNavigate("records")}
                    ariaLabel={
                      zh
                        ? `查看 Run #${run.id} 运行证据`
                        : `Inspect Run #${run.id} evidence`
                    }
                  />
                );
              })
            ) : (
              <div className="p-8">
                <Empty
                  title={zh ? "暂无需要关注的运行" : "No runs need attention"}
                />
              </div>
            )}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-lg border bg-background"
          aria-label={zh ? "自动化健康度" : "Automation health"}
        >
          <div className="border-b px-5 py-4">
            <OperationsRegionHeading
              title={zh ? "自动化健康度" : "Automation health"}
              description={
                zh
                  ? `${workflows.filter((item) => item.enabled).length} 个 Workflow 已启用`
                  : `${workflows.filter((item) => item.enabled).length} Workflows enabled`
              }
            />
          </div>
          <div>
            {workflows.length ? (
              workflows.slice(0, 4).map((workflow) => {
                const metric = metricsByWorkflow.get(workflow.id);
                const latestRun = latestRunByWorkflow.get(workflow.id);
                return (
                  <OperationsObjectRow
                    key={workflow.id}
                    leading={<GitBranch className="size-4" />}
                    title={workflow.name}
                    status={
                      <Tag color={workflow.enabled ? "success" : undefined}>
                        {workflow.enabled
                          ? zh
                            ? "已启用"
                            : "Enabled"
                          : zh
                            ? "已停用"
                            : "Disabled"}
                      </Tag>
                    }
                    meta={`${workflow.cron_expression || (zh ? "手动触发" : "Manual")} · ${workflow.next_run_at ? `${zh ? "下次" : "Next"} ${formatDateTime(workflow.next_run_at)}` : zh ? "暂无下次运行" : "No next run"}`}
                    summary={workflow.description}
                    signals={
                      <>
                        <OperationsMeta>
                          v{workflow.current_version}
                        </OperationsMeta>
                        <OperationsMeta>
                          {metric
                            ? zh
                              ? `${metric.runs} 次运行 · ${metric.failures} 次失败`
                              : `${metric.runs} runs · ${metric.failures} failures`
                            : zh
                              ? "暂无统计"
                              : "No metrics yet"}
                        </OperationsMeta>
                        {latestRun ? (
                          <OperationsMeta>
                            {zh ? "最近" : "Latest"}{" "}
                            {runStatusLabel(latestRun.status, zh)}
                          </OperationsMeta>
                        ) : null}
                      </>
                    }
                    onClick={() => onNavigate("automation")}
                    ariaLabel={
                      zh
                        ? `打开 Workflow：${workflow.name}`
                        : `Open Workflow: ${workflow.name}`
                    }
                  />
                );
              })
            ) : (
              <div className="p-8">
                <Empty title={zh ? "还没有 Workflow" : "No Workflows yet"} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
