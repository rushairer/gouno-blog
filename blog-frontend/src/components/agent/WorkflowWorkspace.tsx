import {
  ArrowDown,
  ArrowUp,
  CirclePause,
  Database,
  Edit2,
  GitBranch,
  History,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Save,
  TestTube2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { workflowApi } from "../../api/workflows";
import { agentApi } from "../../api/agent";
import type {
  Agent,
  ToolDefinition,
  Workflow,
  WorkflowMetric,
  WorkflowRun,
  WorkflowStep,
} from "../../types/agent";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CheckboxField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Field,
  FormActions,
  FormLayout,
  IconButton,
  Input,
  Modal,
  SearchField,
  Select,
  Tag,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { StatusPill } from "./StatusPill";
import { statusLabel } from "./labels";
import { WorkflowInputForm } from "./WorkflowInputForm";
import {
  OperationsMeta,
  OperationsObjectRow,
  OperationsPanelLead,
  OperationsRegionHeading,
  OperationsSummaryStrip,
} from "./OperationsPatterns";
import { DedicatedEditorLead } from "./DedicatedEditorPatterns";

type WorkflowValue = {
  id?: number;
  name: string;
  description: string;
  enabled: boolean;
  cron_expression?: string;
  timezone: string;
  template_key?: string;
  input_schema: Record<string, unknown>;
  steps: WorkflowStep[];
  scope_policy: { mode: "strict" | "unscoped"; discovery_tools: string[] };
  resource_query_empty_policy: "succeed" | "fail";
};

function exampleInput(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const properties = (schema.properties || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  return Object.fromEntries(
    required.map((name) => {
      const property = properties[name] || {};
      if (property.default !== undefined) return [name, property.default];
      if (property.type === "object") return [name, {}];
      if (property.type === "array") return [name, []];
      if (property.type === "boolean") return [name, false];
      if (property.type === "string") return [name, ""];
      return [name, 0];
    }),
  );
}

function uniformWorkflowAgentID(steps: WorkflowStep[]): number | undefined {
  const ids = new Set<number>();
  const collect = (items: WorkflowStep[]) => {
    for (const step of items) {
      if (step.type === "model" && step.agent_id) ids.add(step.agent_id);
      if (step.steps?.length) collect(step.steps);
    }
  };
  collect(steps);
  return ids.size === 1 ? ids.values().next().value : undefined;
}

function localizePlannerWarning(value: string, locale: "en" | "zh"): string {
  if (locale === "zh" && value.includes("AI draft format was invalid"))
    return "AI 返回的草案格式不符合 Workflow 规范，已生成安全的可编辑草案。";
  if (
    locale === "zh" &&
    value.includes("AI draft did not meet workflow safety rules")
  )
    return "AI 返回的草案未通过安全校验，已生成安全的可编辑草案。";
  return value;
}

function bindWorkflowAgent(
  steps: WorkflowStep[],
  agentID: number,
): WorkflowStep[] {
  return steps.map((step) => ({
    ...step,
    ...(step.type === "model" ? { agent_id: agentID } : {}),
    ...(step.steps ? { steps: bindWorkflowAgent(step.steps, agentID) } : {}),
  }));
}

function runFeedbackActionLabel(
  action: "viewRun" | "continueImage",
  locale: "en" | "zh",
): string {
  if (action === "continueImage")
    return locale === "zh"
      ? "继续生成、选择和应用图片"
      : "Continue generating, selecting, and applying images";
  return locale === "zh" ? "查看运行中心" : "Open run center";
}

function Feedback({
  type,
  children,
}: {
  type: "success" | "info" | "warning" | "error";
  children: ReactNode;
}) {
  return (
    <Alert type={type} showIcon role={type === "error" ? "alert" : "status"}>
      {children}
    </Alert>
  );
}

function PanelHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function EditorPanel({
  title,
  description,
  icon,
  closeLabel,
  onClose,
  children,
  className,
  surface = "panel",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  surface?: "panel" | "dedicated";
}) {
  if (surface === "dedicated") {
    return <div className={className}>{children}</div>;
  }
  return (
    <Card
      padding="none"
      className={["p-4 md:p-6", className].filter(Boolean).join(" ")}
    >
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
        }
        description={description}
        actions={
          <IconButton
            variant="ghost"
            size="small"
            label={closeLabel}
            icon={<X />}
            onClick={onClose}
          />
        }
      />
      {children}
    </Card>
  );
}

export function WorkflowWorkspace({
  workflows,
  runs,
  metrics,
  agents,
  tools = [],
  locale,
  onRun,
  onPreflight,
  onRefresh,
  onSave,
  onOpenRecords,
  onOpenRun,
}: {
  workflows: Workflow[];
  runs: WorkflowRun[];
  metrics: WorkflowMetric[];
  agents: Agent[];
  tools?: ToolDefinition[];
  locale: "en" | "zh";
  onRun: (
    workflowID: number,
    dryRun: boolean,
    input: Record<string, unknown>,
  ) => Promise<WorkflowRun>;
  onPreflight?: (
    workflowID: number,
    dryRun: boolean,
    input: Record<string, unknown>,
  ) => Promise<{
    ready: boolean;
    checks: Array<{ key: string; status: string; message?: string }>;
  }>;
  onRefresh?: () => Promise<void>;
  onSave: (value: WorkflowValue) => Promise<void>;
  onOpenRecords?: (workflowID: number) => void;
  onOpenRun?: (workflowID: number, runID: number) => void;
}) {
  const [editing, setEditing] = useState<Workflow | "new" | null>(null);
  const [inputByID, setInputByID] = useState<
    Record<number, Record<string, unknown>>
  >({});
  const [versions, setVersions] = useState<Record<number, Workflow[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningAction, setRunningAction] = useState<{
    workflowID: number;
    dryRun: boolean;
  } | null>(null);
  const [runFeedback, setRunFeedback] = useState<{
    workflowID: number;
    type: "success" | "error";
    message: string;
    runID?: number;
    action?: "viewRun" | "continueImage";
  } | null>(null);
  const [selectedWorkflowID, setSelectedWorkflowID] = useState<number | null>(
    () => {
      const value = Number(
        new URLSearchParams(window.location.search).get("workflow"),
      );
      return Number.isInteger(value) && value > 0 ? value : null;
    },
  );
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);
  const labels =
    locale === "zh"
      ? {
          empty: "还没有 Workflow。",
          add: "创建 Workflow",
          run: "运行",
          dry: "Dry-run",
          enable: "启用",
          disable: "停用",
          versions: "版本",
          rollback: "回滚",
          input: "运行输入",
          steps: "步骤 JSON",
          schema: "输入 Schema",
          save: "保存 Workflow",
          cancel: "取消",
          metrics: "运行 / 失败 / Token",
          createTitle: "创建 Workflow",
          editTitle: "编辑 Workflow",
          schedule: "执行计划",
          next: "下次运行",
          retry: "重试",
          status: "状态",
          never: "从未运行",
        }
      : {
          empty: "No workflows yet.",
          add: "Create Workflow",
          run: "Run",
          dry: "Dry-run",
          enable: "Enable",
          disable: "Disable",
          versions: "Versions",
          rollback: "Rollback",
          input: "Run input JSON",
          steps: "Steps JSON",
          schema: "Input schema",
          save: "Save Workflow",
          cancel: "Cancel",
          metrics: "Runs / failures / tokens",
          createTitle: "Create Workflow",
          editTitle: "Edit Workflow",
          schedule: "Schedule",
          next: "Next run",
          retry: "Retry",
          status: "Status",
          never: "Never",
        };
  const metricMap = useMemo(
    () => new Map(metrics.map((item) => [item.workflow_id, item])),
    [metrics],
  );
  const agentMap = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );
  const sortedWorkflows = useMemo(
    () =>
      [...workflows].sort((left, right) => {
        if (Boolean(left.enabled) !== Boolean(right.enabled)) {
          return left.enabled ? -1 : 1;
        }
        const rightTime =
          Date.parse(right.updated_at || right.created_at || "") || 0;
        const leftTime =
          Date.parse(left.updated_at || left.created_at || "") || 0;
        return rightTime - leftTime || right.id - left.id;
      }),
    [workflows],
  );
  const visibleWorkflows = useMemo(() => {
    let list = sortedWorkflows;
    if (statusFilter === "enabled") {
      list = list.filter((item) => item.enabled);
    } else if (statusFilter === "disabled") {
      list = list.filter((item) => !item.enabled);
    }
    const query = workflowQuery.trim().toLocaleLowerCase();
    if (!query) return list;
    return list.filter((workflow) =>
      [workflow.name, workflow.description, workflow.template_key].some(
        (value) => value?.toLocaleLowerCase().includes(query),
      ),
    );
  }, [sortedWorkflows, statusFilter, workflowQuery]);
  const selectedWorkflow = selectedWorkflowID
    ? workflows.find((workflow) => workflow.id === selectedWorkflowID) || null
    : null;
  const loadVersions = async (workflow: Workflow) => {
    const items = await workflowApi.getVersions(workflow.id);
    setVersions((current) => ({ ...current, [workflow.id]: items }));
  };
  const deleteWorkflow = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await workflowApi.remove(deleteTarget.id);
      if (onRefresh) await onRefresh();
      if (selectedWorkflowID === deleteTarget.id) {
        setSelectedWorkflowID(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("workflow");
        window.history.replaceState(null, "", url);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };
  const waitForRun = async (
    workflowID: number,
    runID: number,
  ): Promise<WorkflowRun> => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const items = await workflowApi.getRuns(workflowID);
      const current = items.find((item) => item.id === runID);
      if (current && !["queued", "running"].includes(current.status))
        return current;
    }
    throw new Error(
      locale === "zh"
        ? `Run #${runID} 仍在后台执行，请稍后到运行记录查看。`
        : `Run #${runID} is still executing. Check the run records later.`,
    );
  };
  const runWorkflow = async (
    workflow: Workflow,
    dryRun: boolean,
    input: Record<string, unknown>,
  ) => {
    setRunningAction({ workflowID: workflow.id, dryRun });
    setRunFeedback(null);
    let runID: number | undefined;
    try {
      if (onPreflight) {
        const preflight = await onPreflight(workflow.id, dryRun, input);
        if (!preflight.ready) {
          const failure = preflight.checks.find(
            (check) => check.status === "error",
          );
          throw new Error(
            failure?.message ||
              (locale === "zh" ? "运行前置检查未通过" : "Run preflight failed"),
          );
        }
      }
      const result = await onRun(workflow.id, dryRun, input);
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        !("status" in result)
      ) {
        throw new Error(
          locale === "zh"
            ? "服务器未返回可核验的运行记录"
            : "The server did not return a verifiable run record",
        );
      }
      const accepted = result as WorkflowRun;
      runID = accepted.id;
      const wasAlreadySucceeded = accepted.status === "succeeded";
      const finalRun = ["queued", "running"].includes(accepted.status)
        ? await waitForRun(workflow.id, accepted.id)
        : accepted;
      await onRefresh?.();
      if (finalRun.status === "failed") {
        throw new Error(
          finalRun.error_message ||
            `${locale === "zh" ? "运行失败" : "Run failed"} (Run #${finalRun.id})`,
        );
      }
      if (finalRun.status === "awaiting_approval") {
        setRunFeedback({
          workflowID: workflow.id,
          type: "success",
          runID: finalRun.id,
          action: "viewRun",
          message:
            locale === "zh"
              ? `Run #${finalRun.id} 已执行并等待审批，没有自动应用内容变更。`
              : `Run #${finalRun.id} completed and is awaiting approval; no content change was applied automatically.`,
        });
        return;
      }
      if (finalRun.status === "waiting_for_user") {
        setRunFeedback({
          workflowID: workflow.id,
          type: "success",
          runID: finalRun.id,
          action: "continueImage",
          message:
            locale === "zh"
              ? `Run #${finalRun.id} 已准备好图片任务，无需前往“待我处理”审批。`
              : `Run #${finalRun.id} prepared the image task without an approval detour.`,
        });
        return;
      }
      if (finalRun.status !== "succeeded") {
        throw new Error(
          `${locale === "zh" ? "未知运行状态" : "Unknown run status"}: ${finalRun.status}`,
        );
      }
      setRunFeedback({
        workflowID: workflow.id,
        type: "success",
        runID: finalRun.id,
        action: "viewRun",
        message:
          locale === "zh"
            ? wasAlreadySucceeded && !dryRun
              ? `今日已有成功运行 Run #${finalRun.id}，本次未重复执行。可到“运行中心 → Workflow 任务”核对日志。`
              : `${dryRun ? "试运行" : "运行"}成功（Run #${finalRun.id}）。状态和运行记录已刷新。`
            : wasAlreadySucceeded && !dryRun
              ? `Run #${finalRun.id} already succeeded today; no duplicate run was created.`
              : `${dryRun ? "Dry-run" : "Run"} succeeded (Run #${finalRun.id}). Status and records were refreshed.`,
      });
    } catch (reason) {
      const detail =
        reason instanceof Error
          ? reason.message
          : locale === "zh"
            ? "未知错误"
            : "Unknown error";
      setRunFeedback({
        workflowID: workflow.id,
        type: "error",
        runID,
        action: runID ? "viewRun" : undefined,
        message:
          locale === "zh"
            ? `${dryRun ? "试运行" : "运行"}失败：${detail}。请修正后重试，步骤日志可在“运行中心 → Workflow 任务”查看。`
            : `${dryRun ? "Dry-run" : "Run"} failed: ${detail}. Fix the issue and retry; step logs are available under “Run center → Workflow tasks”.`,
      });
    } finally {
      setRunningAction(null);
    }
  };
  if (editing)
    return (
      <div
        data-pattern="dedicated-list-editor"
        className="flex flex-col gap-5"
      >
        <DedicatedEditorLead
          title={
            editing === "new"
              ? locale === "zh"
                ? "创建 Workflow"
                : "Create Workflow"
              : locale === "zh"
                ? `编辑 Workflow：${editing.name}`
                : `Edit Workflow: ${editing.name}`
          }
          description={
            locale === "zh"
              ? "编辑 Workflow 是独立的资产配置任务：定义输入契约、流程步骤、执行计划与运行边界；保存形成新版本，运行证据继续进入运行中心。"
              : "Workflow editing is a dedicated asset configuration task for input contracts, steps, schedules, and execution boundaries. Saving creates a new version while evidence remains in the run center."
          }
          backLabel={
            editing === "new"
              ? locale === "zh"
                ? "返回 Workflow 列表"
                : "Back to Workflow list"
              : locale === "zh"
                ? "返回 Workflow 详情"
                : "Back to Workflow detail"
          }
          onBack={() => setEditing(null)}
        />
        <WorkflowEditor
          initial={editing === "new" ? undefined : editing}
          labels={labels}
          agents={agents}
          tools={tools}
          locale={locale}
          onCancel={() => setEditing(null)}
          surface="dedicated"
          onSave={async (value) => {
            await onSave(value);
            setEditing(null);
          }}
        />
      </div>
    );

  const formatTime = (value?: string) =>
    value
      ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
      : "—";

  return (
    <div className="workflow-workspace flex flex-col gap-6">
      <OperationsPanelLead
        title={locale === "zh" ? "自动化资产" : "Automation assets"}
        description={
          locale === "zh"
            ? "Workflow 是持续运行的版本化自动化资产。先从列表判断状态与最近结果，再进入独立详情查看健康度、调度、定义与人工执行。"
            : "Workflows are versioned automation assets. Start from the list, then enter a dedicated detail view for health, scheduling, definition, and manual execution."
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
      />

      {selectedWorkflow ? (
        <div data-slot="workflow-detail" className="min-w-0">
          <div className="workflow-detail-view min-w-0">
            <div className="mb-5">
              <Button
                type="button"
                size="small"
                variant="ghost"
                onClick={() => {
                  setSelectedWorkflowID(null);
                  const url = new URL(window.location.href);
                  url.searchParams.delete("workflow");
                  window.history.replaceState(null, "", url);
                  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                }}
              >
                {locale === "zh"
                  ? "返回 Workflow 列表"
                  : "Back to Workflow list"}
              </Button>
            </div>
            {(() => {
              const workflow = selectedWorkflow;
              const metric = metricMap.get(workflow.id);
              const latestRun = runs.find(
                (run) => run.workflow_id === workflow.id && !run.dry_run,
              );
              const latestDryRun = runs.find(
                (run) => run.workflow_id === workflow.id && run.dry_run,
              );
              const inputValue =
                inputByID[workflow.id] ?? exampleInput(workflow.input_schema);
              const inputProperties =
                workflow.input_schema.properties &&
                typeof workflow.input_schema.properties === "object"
                  ? Object.keys(
                      workflow.input_schema.properties as Record<
                        string,
                        unknown
                      >,
                    )
                  : [];
              const hasRuntimeInput = inputProperties.length > 0;
              const runInput = () => (hasRuntimeInput ? inputValue : {});
              const activeRun =
                runningAction?.workflowID === workflow.id
                  ? runningAction
                  : null;
              const feedback =
                runFeedback?.workflowID === workflow.id ? runFeedback : null;
              const modelSteps = workflow.steps.filter(
                (step) => step.type === "model",
              );
              const unboundStep = modelSteps.find((step) => !step.agent_id);
              const unavailableAgent = modelSteps
                .map((step) =>
                  step.agent_id ? agentMap.get(step.agent_id) : undefined,
                )
                .find((agent) => !agent || !agent.enabled);
              const runBlockReason = unboundStep
                ? locale === "zh"
                  ? "此 Workflow 尚未绑定 Agent，请先完成模型连接初始化。"
                  : "This Workflow has no bound Agent. Complete model setup first."
                : unavailableAgent
                  ? locale === "zh"
                    ? `关联 Agent“${unavailableAgent.name}”未启用，请先在 Agent 页面启用它。`
                    : `Linked Agent “${unavailableAgent.name}” is disabled. Enable it first.`
                  : "";
              const recentRuns = [...runs]
                .filter((run) => run.workflow_id === workflow.id)
                .sort((left, right) => right.id - left.id)
                .slice(0, 5);
              const successRate = metric?.runs
                ? Math.round(
                    ((metric.runs - metric.failures) / metric.runs) * 100,
                  )
                : 0;
              return (
                <div
                  data-slot="ops-detail-stack"
                  className="flex min-w-0 flex-col gap-5"
                >
                  <Card
                    padding="none"
                    className="overflow-hidden"
                    role="region"
                    aria-label={
                      locale === "zh"
                        ? workflow.name + " Workflow 概览"
                        : workflow.name + " Workflow overview"
                    }
                  >
                    <div className="flex flex-col gap-4 border-b p-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.08] text-primary">
                          <GitBranch className="size-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold tracking-tight">
                              {workflow.name}
                            </h2>
                            <Tag
                              color={workflow.enabled ? "success" : undefined}
                            >
                              {workflow.enabled
                                ? locale === "zh"
                                  ? "已启用"
                                  : "Enabled"
                                : locale === "zh"
                                  ? "已停用"
                                  : "Disabled"}
                            </Tag>
                            <Tag>v{workflow.current_version}</Tag>
                          </div>
                          <Text className="mt-1 max-w-3xl" tone="muted">
                            {workflow.description}
                          </Text>
                        </div>
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-2"
                        data-slot="workflow-management-actions"
                      >
                        <Button
                          size="small"
                          variant="outline"
                          type="button"
                          onClick={() => onOpenRecords?.(workflow.id)}
                        >
                          {locale === "zh" ? "运行记录" : "Run records"}
                        </Button>
                        <Button
                          size="small"
                          variant="outline"
                          type="button"
                          onClick={() => setEditing(workflow)}
                          icon={<Edit2 />}
                        >
                          {locale === "zh" ? "编辑" : "Edit"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              label={
                                locale === "zh"
                                  ? "更多 Workflow 操作"
                                  : "More Workflow actions"
                              }
                              size="small"
                              variant="outline"
                              icon={<MoreHorizontal />}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => void loadVersions(workflow)}
                            >
                              <History className="size-4" aria-hidden="true" />
                              {labels.versions}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !workflow.enabled && Boolean(runBlockReason)
                              }
                              onSelect={() =>
                                void workflowApi
                                  .setEnabled(workflow.id, !workflow.enabled)
                                  .then(() => onRefresh?.())
                              }
                            >
                              {workflow.enabled ? (
                                <CirclePause
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Play className="size-4" aria-hidden="true" />
                              )}
                              {workflow.enabled
                                ? labels.disable
                                : labels.enable}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDeleteTarget(workflow)}
                            >
                              <span className="flex items-center gap-2 text-destructive">
                                <Trash2 className="size-4" aria-hidden="true" />
                                {locale === "zh"
                                  ? "删除 Workflow"
                                  : "Delete Workflow"}
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="p-6">
                      <OperationsSummaryStrip
                        ariaLabel={
                          locale === "zh"
                            ? "Workflow 运行摘要"
                            : "Workflow run summary"
                        }
                        items={[
                          {
                            label: locale === "zh" ? "成功率" : "Success rate",
                            value: successRate + "%",
                            detail:
                              locale === "zh"
                                ? (metric?.runs || 0) + " 次运行中的完成率"
                                : (metric?.runs || 0) + " runs",
                          },
                          {
                            label:
                              locale === "zh"
                                ? "最近正式运行"
                                : "Latest live run",
                            value: latestRun
                              ? statusLabel(latestRun.status, locale)
                              : labels.never,
                            detail: latestDryRun
                              ? (locale === "zh"
                                  ? "最近试运行："
                                  : "Latest dry-run: ") +
                                statusLabel(latestDryRun.status, locale)
                              : locale === "zh"
                                ? (metric?.runs || 0) + " 次累计运行"
                                : (metric?.runs || 0) + " total runs",
                          },
                          {
                            label: locale === "zh" ? "失败次数" : "Failures",
                            value: metric?.failures || 0,
                            detail:
                              (metric?.failures || 0) > 0
                                ? locale === "zh"
                                  ? "可在运行中心追溯失败证据"
                                  : "Inspect evidence in the run center"
                                : locale === "zh"
                                  ? "暂无失败记录"
                                  : "No failures",
                          },
                          {
                            label: "Token",
                            value: (metric?.tokens || 0).toLocaleString(),
                            detail:
                              locale === "zh"
                                ? "累计 Workflow Run"
                                : "All Workflow Runs",
                          },
                        ]}
                      />

                      <div className="grid border-b sm:grid-cols-2 xl:grid-cols-4 xl:divide-x">
                        <div className="min-w-0 py-4 xl:pr-5">
                          <Text size="xs" tone="muted">
                            {labels.next}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            {formatTime(workflow.next_run_at)}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.enabled
                              ? locale === "zh"
                                ? "Scheduler 已启用"
                                : "Scheduler enabled"
                              : locale === "zh"
                                ? "Workflow 已停用"
                                : "Workflow disabled"}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:px-5">
                          <Text size="xs" tone="muted">
                            {labels.schedule}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            {workflow.cron_expression ||
                              (locale === "zh" ? "仅手动" : "Manual only")}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.timezone}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:px-5">
                          <Text size="xs" tone="muted">
                            {locale === "zh" ? "当前版本" : "Current version"}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            v{workflow.current_version}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {workflow.template_key ||
                              (locale === "zh"
                                ? "自定义 Workflow"
                                : "Custom Workflow")}
                          </Text>
                        </div>
                        <div className="min-w-0 py-4 xl:pl-5">
                          <Text size="xs" tone="muted">
                            {locale === "zh" ? "流程规模" : "Flow size"}
                          </Text>
                          <strong className="mt-1 block text-sm">
                            {workflow.steps.length}{" "}
                            {locale === "zh" ? "个步骤" : "steps"}
                          </strong>
                          <Text size="xs" tone="muted" className="mt-1">
                            {inputProperties.length}{" "}
                            {locale === "zh" ? "项运行输入" : "runtime inputs"}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card
                    padding="none"
                    className="overflow-hidden"
                    role="region"
                    aria-label={locale === "zh" ? "最近运行" : "Recent runs"}
                  >
                    <div className="border-b px-6 py-4">
                      <OperationsRegionHeading
                        title={locale === "zh" ? "最近运行" : "Recent runs"}
                        description={
                          locale === "zh"
                            ? "先看最近执行结果；需要完整步骤、资源与人工交互证据时进入运行中心。"
                            : "Review recent results here, then open the run center for full steps, resources, and human interaction evidence."
                        }
                        action={
                          <Button
                            size="small"
                            variant="ghost"
                            type="button"
                            onClick={() => onOpenRecords?.(workflow.id)}
                          >
                            {locale === "zh" ? "查看全部" : "View all"}
                          </Button>
                        }
                      />
                    </div>
                    {recentRuns.length ? (
                      <div className="divide-y">
                        {recentRuns.map((run) => {
                          const startedAt = run.started_at || run.created_at;
                          const start = startedAt
                            ? new Date(startedAt).getTime()
                            : 0;
                          const finish = run.finished_at
                            ? new Date(run.finished_at).getTime()
                            : 0;
                          const durationSeconds =
                            start && finish
                              ? Math.max(0, (finish - start) / 1000)
                              : 0;
                          return (
                            <Button
                              key={run.id}
                              type="button"
                              variant="ghost"
                              block
                              className="grid h-auto w-full min-w-0 grid-cols-1 gap-3 whitespace-normal rounded-none px-6 py-3.5 text-left font-normal transition-colors hover:bg-muted/35 sm:grid-cols-[7rem_7rem_minmax(7rem,0.7fr)_6rem_minmax(0,1.5fr)] sm:items-center [&>span]:contents"
                              onClick={() => onOpenRun?.(workflow.id, run.id)}
                              aria-label={
                                (locale === "zh"
                                  ? "打开最近 Run #"
                                  : "Open recent Run #") + run.id
                              }
                            >
                              <strong className="text-sm">Run #{run.id}</strong>
                              <span>
                                <StatusPill
                                  status={run.status}
                                  locale={locale}
                                />
                              </span>
                              <Text size="xs" tone="muted">
                                {formatTime(startedAt)}
                              </Text>
                              <Text size="xs" tone="muted">
                                {durationSeconds
                                  ? durationSeconds.toFixed(1) + " s"
                                  : "—"}
                              </Text>
                              <span className="min-w-0">
                                <Text size="sm" className="truncate">
                                  {run.error_message ||
                                    (locale === "zh"
                                      ? "运行证据已记录"
                                      : "Run evidence recorded")}
                                </Text>
                                <Text size="xs" tone="muted" className="mt-0.5">
                                  {(
                                    (run.input_tokens || 0) +
                                    (run.output_tokens || 0)
                                  ).toLocaleString()}{" "}
                                  Token
                                  {run.dry_run ? " · Dry-run" : ""}
                                </Text>
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6">
                        <Text tone="muted">
                          {locale === "zh"
                            ? "这个 Workflow 暂无运行记录。"
                            : "This Workflow has no run history yet."}
                        </Text>
                      </div>
                    )}
                  </Card>

                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
                    <Card
                      padding="none"
                      className="overflow-hidden"
                      role="region"
                      aria-label={
                        locale === "zh"
                          ? "Workflow 流程定义"
                          : "Workflow definition"
                      }
                    >
                      <div className="border-b px-6 py-4">
                        <OperationsRegionHeading
                          title={
                            locale === "zh" ? "流程定义" : "Flow definition"
                          }
                          description={
                            locale === "zh"
                              ? workflow.steps.length +
                                " 个步骤，按实际执行顺序排列。定义说明“会做什么”，运行证据在运行中心查看。"
                              : workflow.steps.length +
                                " steps in execution order. This defines what the Workflow does; run evidence remains in the run center."
                          }
                          action={
                            workflow.template_key ? (
                              <Tag>{workflow.template_key}</Tag>
                            ) : undefined
                          }
                        />
                      </div>
                      <ol className="divide-y">
                        {workflow.steps.map((step, index) => (
                          <li key={step.id} className="flex gap-4 px-6 py-4">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="text-sm">
                                  {step.name || step.id}
                                </strong>
                                <Tag>{step.type}</Tag>
                              </div>
                              <Text size="xs" tone="muted" className="mt-1">
                                {step.agent_id
                                  ? (agentMap.get(step.agent_id)?.name ||
                                      "Agent #" + step.agent_id) + " · "
                                  : ""}
                                {step.id}
                              </Text>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </Card>

                    <div className="flex min-w-0 flex-col gap-5">
                      <Card
                        padding="base"
                        role="region"
                        aria-label={
                          locale === "zh"
                            ? "Workflow 运行边界"
                            : "Workflow run boundary"
                        }
                      >
                        <OperationsRegionHeading
                          title={locale === "zh" ? "运行边界" : "Run boundary"}
                          description={
                            locale === "zh"
                              ? "决定 Workflow 可以发现什么，以及哪些对象可以成为本次运行的目标。"
                              : "Defines what the Workflow can discover and which resources may become run targets."
                          }
                        />
                        <dl className="mt-4 space-y-4 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Scope
                            </dt>
                            <dd className="mt-1 font-medium">
                              {workflow.scope_policy?.mode === "strict"
                                ? locale === "zh"
                                  ? "严格限制目标资源"
                                  : "Strictly limited to target resources"
                                : locale === "zh"
                                  ? "Unscoped 兼容模式"
                                  : "Unscoped compatibility mode"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {locale === "zh" ? "发现工具" : "Discovery tools"}
                            </dt>
                            <dd className="mt-1 font-medium">
                              {workflow.scope_policy?.discovery_tools?.length
                                ? workflow.scope_policy.discovery_tools.join(
                                    " · ",
                                  )
                                : locale === "zh"
                                  ? "无额外发现工具"
                                  : "No extra discovery tools"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              {locale === "zh"
                                ? "空结果策略"
                                : "Empty result policy"}
                            </dt>
                            <dd className="mt-1 font-medium">
                              {workflow.resource_query_empty_policy === "fail"
                                ? locale === "zh"
                                  ? "视为运行失败"
                                  : "Fail the run"
                                : locale === "zh"
                                  ? "正常结束，不产生后续动作"
                                  : "Finish successfully with no downstream action"}
                            </dd>
                          </div>
                        </dl>
                      </Card>

                      <Card
                        padding="base"
                        role="region"
                        aria-label={
                          locale === "zh"
                            ? "运行当前 Workflow"
                            : "Run current Workflow"
                        }
                      >
                        <OperationsRegionHeading
                          title={
                            locale === "zh"
                              ? "运行当前 Workflow"
                              : "Run current Workflow"
                          }
                          description={
                            locale === "zh"
                              ? "人工执行只覆盖本次运行输入，不会改写当前 Workflow Version。"
                              : "Manual execution overrides only this run's input; it never rewrites the current Workflow Version."
                          }
                        />
                        <div className="mt-5">
                          {hasRuntimeInput ? (
                            <WorkflowInputForm
                              schema={workflow.input_schema}
                              value={inputValue}
                              onChange={(next) =>
                                setInputByID((current) => ({
                                  ...current,
                                  [workflow.id]: next,
                                }))
                              }
                              locale={locale}
                            />
                          ) : (
                            <div className="rounded-lg border bg-muted/[0.18] p-4">
                              <Text size="xs" tone="muted">
                                {labels.input}
                              </Text>
                              <strong className="mt-1 block text-sm">
                                {locale === "zh"
                                  ? "无需手动填写"
                                  : "No manual input required"}
                              </strong>
                              <Text size="xs" tone="muted" className="mt-1">
                                {locale === "zh"
                                  ? "此流程使用计划规则或 Agent 的受控只读工具获取运行上下文。"
                                  : "This workflow obtains context from scheduled rules or governed read tools."}
                              </Text>
                            </div>
                          )}
                        </div>

                        {runBlockReason ? (
                          <div className="mt-4">
                            <Feedback type="error">{runBlockReason}</Feedback>
                          </div>
                        ) : null}
                        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-5">
                          <Button
                            variant="outline"
                            loading={Boolean(activeRun?.dryRun)}
                            disabled={
                              Boolean(runBlockReason) || Boolean(activeRun)
                            }
                            title={runBlockReason || undefined}
                            type="button"
                            onClick={() =>
                              void runWorkflow(workflow, true, runInput())
                            }
                            icon={<TestTube2 />}
                          >
                            {activeRun?.dryRun
                              ? locale === "zh"
                                ? "试运行中…"
                                : "Dry-running…"
                              : labels.dry}
                          </Button>
                          <Button
                            variant="solid"
                            color="primary"
                            loading={Boolean(activeRun && !activeRun.dryRun)}
                            disabled={
                              !workflow.enabled ||
                              latestRun?.status === "running" ||
                              Boolean(runBlockReason) ||
                              Boolean(activeRun)
                            }
                            title={runBlockReason || undefined}
                            type="button"
                            onClick={() =>
                              void runWorkflow(workflow, false, runInput())
                            }
                            icon={<Play />}
                          >
                            {activeRun && !activeRun.dryRun
                              ? locale === "zh"
                                ? "运行中…"
                                : "Running…"
                              : latestRun?.status === "failed"
                                ? labels.retry
                                : labels.run}
                          </Button>
                        </div>

                        {activeRun ? (
                          <div
                            className="mt-4 flex items-start gap-3 rounded-lg border bg-muted/[0.18] p-4"
                            role="status"
                            aria-live="polite"
                          >
                            <span
                              className="spinner mt-0.5"
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <strong className="block text-sm">
                                {locale === "zh"
                                  ? (activeRun.dryRun ? "试运行" : "Workflow") +
                                    " 正在执行"
                                  : (activeRun.dryRun
                                      ? "Dry-run"
                                      : "Workflow") + " is running"}
                              </strong>
                              <Text size="xs" tone="muted" className="mt-1">
                                {locale === "zh"
                                  ? "请勿重复点击；完成后会自动刷新状态和运行记录。"
                                  : "Do not submit again. Status and run records refresh automatically when complete."}
                              </Text>
                            </span>
                          </div>
                        ) : null}
                        {feedback ? (
                          <div className="mt-4">
                            <Feedback type={feedback.type}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span>{feedback.message}</span>
                                {feedback.runID ? (
                                  <Button
                                    variant="outline"
                                    className="shrink-0"
                                    type="button"
                                    onClick={() =>
                                      onOpenRun?.(
                                        workflow.id,
                                        feedback.runID as number,
                                      )
                                    }
                                  >
                                    {runFeedbackActionLabel(
                                      feedback.action || "viewRun",
                                      locale,
                                    )}
                                  </Button>
                                ) : null}
                              </div>
                            </Feedback>
                          </div>
                        ) : null}
                      </Card>
                    </div>
                  </div>

                  {versions[workflow.id]?.length ? (
                    <section className="rounded-lg border bg-background p-6">
                      <OperationsRegionHeading
                        title={locale === "zh" ? "版本历史" : "Version history"}
                        description={
                          locale === "zh"
                            ? "回滚会创建新的当前版本，不会删除历史运行证据。"
                            : "Rollback creates a new current version and preserves historical run evidence."
                        }
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {versions[workflow.id].map((version) => (
                          <Button
                            variant="ghost"
                            key={version.version_id}
                            disabled={
                              version.current_version ===
                              workflow.current_version
                            }
                            onClick={() =>
                              void workflowApi
                                .rollback(
                                  workflow.id,
                                  version.current_version || 0,
                                )
                                .then(() => onRefresh?.())
                            }
                            icon={<RotateCcw />}
                          >
                            v{version.current_version}
                          </Button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <Card
          padding="none"
          className="overflow-hidden"
          role="region"
          aria-label={locale === "zh" ? "Workflow 资产" : "Workflow assets"}
        >
          <div className="flex flex-col gap-3 border-b bg-muted/[0.12] px-4 py-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <SearchField
                aria-label={
                  locale === "zh" ? "搜索 Workflow" : "Search workflows"
                }
                value={workflowQuery}
                onChange={(event) => setWorkflowQuery(event.target.value)}
                placeholder={
                  locale === "zh" ? "搜索 Workflow" : "Search workflows"
                }
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="sm:w-44">
                <Select
                  aria-label={
                    locale === "zh"
                      ? "按状态筛选 Workflow"
                      : "Filter workflows by status"
                  }
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(
                      selectValue(value) as "all" | "enabled" | "disabled",
                    )
                  }
                >
                  <option value="all">
                    {locale === "zh" ? "全部状态" : "All status"}
                  </option>
                  <option value="enabled">
                    {locale === "zh" ? "已启用" : "Enabled"}
                  </option>
                  <option value="disabled">
                    {locale === "zh" ? "已停用" : "Disabled"}
                  </option>
                </Select>
              </div>
              <Text
                size="xs"
                tone="muted"
                className="shrink-0 sm:min-w-16 sm:text-right"
              >
                {visibleWorkflows.length} / {workflows.length}
              </Text>
            </div>
          </div>
          <div
            role="list"
            aria-label={locale === "zh" ? "Workflow 列表" : "Workflow list"}
          >
            {visibleWorkflows.length ? (
              visibleWorkflows.map((workflow) => {
                const latestRun = runs.find(
                  (run) => run.workflow_id === workflow.id && !run.dry_run,
                );
                return (
                  <div key={workflow.id} role="listitem">
                    <OperationsObjectRow
                      leading={<GitBranch className="size-4" />}
                      title={workflow.name}
                      status={
                        <Tag color={workflow.enabled ? "success" : undefined}>
                          {workflow.enabled
                            ? locale === "zh"
                              ? "已启用"
                              : "Enabled"
                            : locale === "zh"
                              ? "已停用"
                              : "Disabled"}
                        </Tag>
                      }
                      meta={
                        (workflow.cron_expression ||
                          (locale === "zh" ? "仅手动" : "Manual")) +
                        " · v" +
                        workflow.current_version
                      }
                      summary={workflow.description}
                      signals={
                        <>
                          <OperationsMeta>
                            {labels.next} {formatTime(workflow.next_run_at)}
                          </OperationsMeta>
                          {latestRun ? (
                            <OperationsMeta>
                              {locale === "zh" ? "最近 " : "Latest "}
                              {statusLabel(latestRun.status, locale)}
                            </OperationsMeta>
                          ) : null}
                        </>
                      }
                      onClick={() => {
                        setSelectedWorkflowID(workflow.id);
                        const url = new URL(window.location.href);
                        url.searchParams.set("workflow", String(workflow.id));
                        window.history.replaceState(null, "", url);
                        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                      }}
                      ariaLabel={
                        (locale === "zh"
                          ? "打开 Workflow："
                          : "Open Workflow: ") + workflow.name
                      }
                    />
                  </div>
                );
              })
            ) : (
              <div className="p-6">
                <Empty
                  title={
                    locale === "zh"
                      ? "没有符合条件的 Workflow。"
                      : "No matching workflows."
                  }
                />
              </div>
            )}
          </div>
        </Card>
      )}
      <Modal
        open={deleteTarget !== null}
        title={locale === "zh" ? "删除 Workflow？" : "Delete workflow?"}
        description={
          deleteTarget
            ? locale === "zh"
              ? `删除“${deleteTarget.name}”后将停止后续运行。历史版本和运行审计会保留。`
              : `Deleting “${deleteTarget.name}” stops future runs. Version history and run audits are retained.`
            : ""
        }
        okText={locale === "zh" ? "删除 Workflow" : "Delete workflow"}
        cancelText={locale === "zh" ? "取消" : "Cancel"}
        confirmLoading={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        onOk={deleteWorkflow}
        okButtonProps={{ variant: "solid", color: "error" }}
        closeOnBackdrop
      />
    </div>
  );
}

type ResourceQueryFilter = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "datetime-local";
  options?: string[];
};

const resourceQueryTypes = [
  ["post", "文章"],
  ["comment", "评论"],
  ["media_asset", "媒体"],
  ["operational_suggestion", "运营建议"],
  ["category", "分类"],
  ["tag", "标签"],
  ["page", "单页"],
] as const;

const resourceQueryFilters: Record<string, ResourceQueryFilter[]> = {
  post: [
    {
      key: "status",
      label: "状态",
      type: "select",
      options: ["draft", "scheduled", "published"],
    },
    { key: "category", label: "分类 Slug", type: "text" },
    { key: "tag", label: "标签", type: "text" },
    { key: "updated_before_days", label: "距今未更新天数", type: "number" },
    { key: "published_within_days", label: "最近发布天数", type: "number" },
    { key: "min_views", label: "最低阅读量", type: "number" },
    {
      key: "low_engagement",
      label: "低互动",
      type: "select",
      options: ["true"],
    },
    {
      key: "published_after",
      label: "发布于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "published_before",
      label: "发布于此前（UTC）",
      type: "datetime-local",
    },
    {
      key: "updated_after",
      label: "更新于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "updated_before",
      label: "更新于此前（UTC）",
      type: "datetime-local",
    },
  ],
  comment: [
    {
      key: "status",
      label: "状态",
      type: "select",
      options: ["pending", "visible", "hidden"],
    },
    { key: "post_id", label: "所属文章 ID", type: "number" },
    { key: "reported", label: "仅被举报", type: "select", options: ["true"] },
    {
      key: "created_after",
      label: "创建于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "created_before",
      label: "创建于此前（UTC）",
      type: "datetime-local",
    },
  ],
  media_asset: [
    { key: "content_type", label: "内容类型", type: "text" },
    {
      key: "in_use",
      label: "引用状态",
      type: "select",
      options: ["true", "false"],
    },
    {
      key: "missing_alt",
      label: "缺失 Alt",
      type: "select",
      options: ["true"],
    },
    {
      key: "created_after",
      label: "创建于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "created_before",
      label: "创建于此前（UTC）",
      type: "datetime-local",
    },
  ],
  operational_suggestion: [
    {
      key: "status",
      label: "状态",
      type: "select",
      options: ["new", "selected", "converted", "ignored", "resolved"],
    },
    {
      key: "priority",
      label: "优先级",
      type: "select",
      options: ["low", "medium", "high"],
    },
    { key: "source_type", label: "来源类型", type: "text" },
    {
      key: "created_after",
      label: "创建于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "created_before",
      label: "创建于此前（UTC）",
      type: "datetime-local",
    },
  ],
  category: [{ key: "min_post_count", label: "最少文章数", type: "number" }],
  tag: [{ key: "min_post_count", label: "最少文章数", type: "number" }],
  page: [
    {
      key: "status",
      label: "状态",
      type: "select",
      options: ["draft", "published"],
    },
    { key: "template", label: "模板", type: "text" },
    {
      key: "show_in_nav",
      label: "导航显示",
      type: "select",
      options: ["true", "false"],
    },
    { key: "updated_before_days", label: "距今未更新天数", type: "number" },
    {
      key: "updated_after",
      label: "更新于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "updated_before",
      label: "更新于此前（UTC）",
      type: "datetime-local",
    },
    {
      key: "created_after",
      label: "创建于此后（UTC）",
      type: "datetime-local",
    },
    {
      key: "created_before",
      label: "创建于此前（UTC）",
      type: "datetime-local",
    },
  ],
};

function resourceQueryInputValue(
  value: unknown,
  type: ResourceQueryFilter["type"],
) {
  if (type !== "datetime-local" || typeof value !== "string" || !value)
    return String(value ?? "");
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 16);
}

function ResourceQueryBuilder({
  step,
  onAdd,
  onChange,
  onRemove,
  savedPreview,
  lastCount,
}: {
  step?: WorkflowStep;
  onAdd: () => void;
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  savedPreview?: number;
  lastCount?: number;
}) {
  const resourceType = step?.resource_type || "post";
  const filters = useMemo(() => step?.filter || {}, [step?.filter]);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState("");
  const filterSignature = JSON.stringify(filters);
  useEffect(() => {
    if (!step) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams({ page: "1", page_size: "1" });
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== "" && value !== undefined && value !== null)
          parameters.set(key, String(value));
      });
      workflowApi
        .getResources(resourceType, parameters, controller.signal)
        .then((data) => {
          setPreview(Number(data.total || 0));
          setPreviewError("");
        })
        .catch((reason: Error) => {
          if (reason.name !== "AbortError") {
            setPreview(null);
            setPreviewError(reason.message);
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filterSignature, filters, resourceType, step]);
  if (!step)
    return (
      <section className="workflow-resource-query-builder">
        <div>
          <strong>
            <Database />
            动态资源筛选
          </strong>
          <p>每次计划运行开始时固定目标集合；后续重试会复用同一快照。</p>
        </div>
        <Button variant="outline" type="button" onClick={onAdd} icon={<Plus />}>
          添加动态资源筛选
        </Button>
      </section>
    );
  const updateFilter = (
    key: string,
    value: string,
    type: ResourceQueryFilter["type"],
  ) => {
    const next = { ...filters } as Record<string, unknown>;
    if (!value) delete next[key];
    else
      next[key] =
        type === "datetime-local"
          ? new Date(value).toISOString()
          : type === "number"
            ? Number(value)
            : value;
    onChange({ ...step, filter: next });
  };
  return (
    <section className="workflow-resource-query-builder">
      <div className="workflow-resource-query-heading">
        <div>
          <strong>
            <Database />
            动态资源筛选
          </strong>
          <p>
            计划启动时解析并固定目标；预计命中{" "}
            {preview === null ? "—" : `${preview} 项`}。
          </p>
          {savedPreview !== undefined ? (
            <small>
              已保存预览：{savedPreview} 项
              {lastCount !== undefined ? `；上次实际命中：${lastCount} 项` : ""}
            </small>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="small"
          className="shrink-0 max-[540px]:self-end"
          type="button"
          onClick={onRemove}
          icon={<X />}
        >
          移除
        </Button>
      </div>
      <div className="form-grid workflow-resource-query-core">
        <Field label="资源类型">
          <Select
            value={resourceType}
            onChange={(value) =>
              onChange({
                ...step,
                resource_type: selectValue(
                  value,
                ) as WorkflowStep["resource_type"],
                filter: {},
              })
            }
            aria-label="资源类型"
          >
            {resourceQueryTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="单次最多处理">
          <Input
            type="number"
            min="1"
            max="100"
            value={step.max_items || 20}
            onChange={(event) =>
              onChange({
                ...step,
                max_items: Math.max(
                  1,
                  Math.min(100, Number(event.target.value) || 1),
                ),
              })
            }
          />
        </Field>
      </div>
      <div className="workflow-resource-query-filters">
        {(resourceQueryFilters[resourceType] || []).map((filter) => (
          <Field key={filter.key} label={filter.label}>
            {filter.type === "select" ? (
              <Select
                value={String(filters[filter.key] ?? "")}
                onChange={(value) =>
                  updateFilter(filter.key, selectValue(value), filter.type)
                }
                aria-label={filter.label}
              >
                <option value="">全部</option>
                {filter.options?.map((option) => (
                  <option key={option} value={option}>
                    {option === "true"
                      ? "是"
                      : option === "false"
                        ? "否"
                        : option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type={filter.type}
                min={filter.type === "number" ? 0 : undefined}
                value={resourceQueryInputValue(
                  filters[filter.key],
                  filter.type,
                )}
                onChange={(event) =>
                  updateFilter(filter.key, event.target.value, filter.type)
                }
              />
            )}
          </Field>
        ))}
      </div>
      {previewError ? (
        <Feedback type="error">无法预览命中数：{previewError}</Feedback>
      ) : null}
    </section>
  );
}

function schemaScalar(value: string, type: string): string | number | boolean {
  if (type === "integer") return Number.parseInt(value, 10);
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  return value;
}

function SchemaFieldBuilder({
  schemaJSON,
  onChange,
}: {
  schemaJSON: string;
  onChange: (value: string) => void;
}) {
  const schema = parseJSON<{
    type?: string;
    additionalProperties?: boolean;
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
  }>(schemaJSON);
  if (!schema || schema.type !== "object")
    return (
      <Feedback type="error">
        输入 Schema JSON 无法解析。请在高级设置中修正。
      </Feedback>
    );
  const properties = schema.properties || {};
  const save = (next: typeof schema) =>
    onChange(
      JSON.stringify(
        { ...next, type: "object", additionalProperties: false },
        null,
        2,
      ),
    );
  const add = () => {
    let key = "input";
    let index = 2;
    while (properties[key]) key = `input_${index++}`;
    save({
      ...schema,
      properties: { ...properties, [key]: { type: "string", title: key } },
    });
  };
  return (
    <section className="workflow-schema-builder">
      <div className="workflow-resource-query-heading">
        <div>
          <strong>输入字段</strong>
          <p>资源字段会自动显示为文章、评论或媒体等选择器。</p>
        </div>
        <Button
          variant="outline"
          size="small"
          className="shrink-0 max-[540px]:self-end"
          type="button"
          onClick={add}
          icon={<Plus />}
        >
          添加字段
        </Button>
      </div>
      {Object.entries(properties).map(([key, property]) => {
        const resource = String(property["x-gouno-resource"] || "");
        const isArray = property.type === "array";
        const type = String(property.type || "string");
        const set = (next: Record<string, unknown>) =>
          save({ ...schema, properties: { ...properties, [key]: next } });
        const enumValues = Array.isArray(property.enum) ? property.enum : [];
        const scalar = !resource && !isArray;
        return (
          <article className="workflow-schema-field" key={key}>
            <div className="form-grid">
              <Field label="字段名">
                <Input
                  value={key}
                  onChange={(event) => {
                    const name = event.target.value.trim();
                    if (!name || name === key || properties[name]) return;
                    const next = { ...properties, [name]: property };
                    delete next[key];
                    save({
                      ...schema,
                      properties: next,
                      required: (schema.required || []).map((item) =>
                        item === key ? name : item,
                      ),
                    });
                  }}
                />
              </Field>
              <Field label="标题">
                <Input
                  value={String(property.title || "")}
                  onChange={(event) =>
                    set({ ...property, title: event.target.value })
                  }
                />
              </Field>
              <Field label="类型">
                <Select
                  value={isArray ? "array" : type}
                  disabled={Boolean(resource)}
                  onChange={(value) => {
                    const next: Record<string, unknown> = {
                      ...property,
                      type: selectValue(value),
                      ...(selectValue(value) === "array"
                        ? { items: { type: "string" } }
                        : {}),
                    };
                    delete next.enum;
                    delete next.default;
                    set(next);
                  }}
                  aria-label="类型"
                >
                  <option value="string">字符串</option>
                  <option value="integer">整数</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                  <option value="array">数组</option>
                </Select>
              </Field>
              <Field label="资源类型">
                <Select
                  value={resource}
                  onChange={(value) => {
                    const resourceType = selectValue(value);
                    if (!resourceType) {
                      const next = { ...property };
                      delete next["x-gouno-resource"];
                      delete next["x-gouno-widget"];
                      set(next);
                      return;
                    }
                    const keyType =
                      resourceType === "tag" ? "string" : "integer";
                    const next: Record<string, unknown> = {
                      ...property,
                      type: isArray ? "array" : keyType,
                      ...(isArray ? { items: { type: keyType } } : {}),
                      "x-gouno-resource": resourceType,
                      "x-gouno-widget": isArray
                        ? "entity-multi-select"
                        : "entity-select",
                    };
                    delete next.enum;
                    delete next.default;
                    set(next);
                  }}
                  aria-label="资源类型"
                >
                  <option value="">普通字段</option>
                  <option value="post">文章</option>
                  <option value="comment">评论</option>
                  <option value="media_asset">媒体</option>
                  <option value="operational_suggestion">运营建议</option>
                  <option value="category">分类</option>
                  <option value="tag">标签</option>
                  <option value="page">单页</option>
                </Select>
              </Field>
            </div>
            <div className="form-grid">
              <CheckboxField>
                <Checkbox
                  checked={(schema.required || []).includes(key)}
                  onChange={(event) =>
                    save({
                      ...schema,
                      required: event.target.checked
                        ? [...new Set([...(schema.required || []), key])]
                        : (schema.required || []).filter(
                            (item) => item !== key,
                          ),
                    })
                  }
                />
                <span>必填</span>
              </CheckboxField>
              {resource || isArray ? (
                <>
                  <Field label="最少数量">
                    <Input
                      type="number"
                      min="0"
                      value={Number(property.minItems || 0)}
                      onChange={(event) =>
                        set({
                          ...property,
                          minItems: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                  <Field label="最多数量">
                    <Input
                      type="number"
                      min="1"
                      value={Number(property.maxItems || 20)}
                      onChange={(event) =>
                        set({
                          ...property,
                          maxItems: Number(event.target.value) || 1,
                        })
                      }
                    />
                  </Field>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="small"
                type="button"
                onClick={() => {
                  const next = { ...properties };
                  delete next[key];
                  save({
                    ...schema,
                    properties: next,
                    required: (schema.required || []).filter(
                      (item) => item !== key,
                    ),
                  });
                }}
                icon={<Trash2 />}
              >
                删除
              </Button>
            </div>
            {scalar ? (
              <div className="form-grid">
                <Field label="枚举值" hint="用逗号分隔；留空表示不限制。">
                  <Input
                    value={enumValues.join(", ")}
                    onChange={(event) => {
                      const values = event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((item) => schemaScalar(item, type));
                      const next = { ...property };
                      if (values.length) next.enum = values;
                      else delete next.enum;
                      if (
                        next.default !== undefined &&
                        !values.some((item) => Object.is(item, next.default))
                      )
                        delete next.default;
                      set(next);
                    }}
                  />
                </Field>
                <Field label="默认值" hint="运行表单仅在未填写时使用此值。">
                  <Input
                    value={
                      property.default === undefined
                        ? ""
                        : String(property.default)
                    }
                    onChange={(event) => {
                      const next = { ...property };
                      const raw = event.target.value.trim();
                      if (!raw) delete next.default;
                      else next.default = schemaScalar(raw, type);
                      set(next);
                    }}
                  />
                </Field>
              </div>
            ) : null}
            <Field label="说明">
              <Input
                value={String(property.description || "")}
                onChange={(event) =>
                  set({ ...property, description: event.target.value })
                }
              />
            </Field>
          </article>
        );
      })}
    </section>
  );
}

function parseJSON<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function WorkflowEditor({
  initial,
  labels,
  agents,
  tools,
  locale,
  onSave,
  onCancel,
  surface = "panel",
}: {
  initial?: Workflow;
  labels: Record<string, string>;
  agents: Agent[];
  tools: ToolDefinition[];
  locale: "en" | "zh";
  onSave: (value: WorkflowValue) => Promise<void>;
  onCancel: () => void;
  surface?: "panel" | "dedicated";
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [cronExpression, setCronExpression] = useState(
    initial?.cron_expression || "",
  );
  const [timezone, setTimezone] = useState(
    initial?.timezone || "Asia/Shanghai",
  );
  const [templateKey, setTemplateKey] = useState(initial?.template_key || "");
  const [emptyPolicy, setEmptyPolicy] = useState<"succeed" | "fail">(
    initial?.resource_query_empty_policy || "succeed",
  );
  const [schema, setSchema] = useState(
    JSON.stringify(
      initial?.input_schema || { type: "object", additionalProperties: false },
      null,
      2,
    ),
  );
  const [steps, setSteps] = useState(
    JSON.stringify(initial?.steps || [], null, 2),
  );
  const [scopeMode, setScopeMode] = useState<"strict" | "unscoped">(
    initial?.scope_policy?.mode || "unscoped",
  );
  const [discoveryTools, setDiscoveryTools] = useState<string[]>(
    initial?.scope_policy?.discovery_tools || [],
  );
  const [goal, setGoal] = useState("");
  const [planning, setPlanning] = useState(false);
  const [draftingAgents, setDraftingAgents] = useState(false);
  const [agentDrafts, setAgentDrafts] = useState<
    Awaited<ReturnType<typeof workflowApi.draftAgentSkills>>["drafts"]
  >([]);
  const [savingAgentDraft, setSavingAgentDraft] = useState<string | null>(null);
  const [plannerMessage, setPlannerMessage] = useState<{
    type: "error" | "success" | "info";
    text: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const [boundAgentID, setBoundAgentID] = useState<number | "">(
    () => uniformWorkflowAgentID(initial?.steps || []) || "",
  );
  const parsedSteps = useMemo(() => {
    try {
      const value = JSON.parse(steps);
      return Array.isArray(value) ? (value as WorkflowStep[]) : null;
    } catch {
      return null;
    }
  }, [steps]);
  const resourceQueryIndex =
    parsedSteps?.findIndex((step) => step.type === "resource_query") ?? -1;
  const resourceQueryStep =
    resourceQueryIndex >= 0 ? parsedSteps?.[resourceQueryIndex] : undefined;
  const forEachIndex =
    parsedSteps?.findIndex((step) => step.type === "for_each") ?? -1;
  const forEachStep =
    forEachIndex >= 0 ? parsedSteps?.[forEachIndex] : undefined;
  const selectedAgent = agents.find((agent) => agent.id === boundAgentID);
  const allAuthorizedDiscoveryTools = tools.filter(
    (tool) =>
      tool.risk_level === "read" &&
      tool.scope?.discovery &&
      Boolean(selectedAgent?.skill?.capabilities.includes(tool.name)),
  );
  const authorizedDiscoveryTools = allAuthorizedDiscoveryTools.filter((tool) =>
    `${tool.name} ${tool.description} ${tool.description_zh || ""}`
      .toLowerCase()
      .includes(toolQuery.trim().toLowerCase()),
  );
  const unavailableDiscoveryTools = discoveryTools.filter(
    (name) => !allAuthorizedDiscoveryTools.some((tool) => tool.name === name),
  );
  const updateResourceQuery = (next: WorkflowStep) => {
    if (!parsedSteps || resourceQueryIndex < 0) return;
    const nextSteps = [...parsedSteps];
    nextSteps[resourceQueryIndex] = next;
    setSteps(JSON.stringify(nextSteps, null, 2));
    setScopeMode("strict");
  };
  const addResourceQuery = () => {
    if (!parsedSteps || resourceQueryIndex >= 0) return;
    const ids = new Set(parsedSteps.map((step) => step.id));
    let id = "select_resources";
    for (let index = 2; ids.has(id); index += 1)
      id = `select_resources_${index}`;
    setSteps(
      JSON.stringify(
        [
          {
            id,
            type: "resource_query",
            resource_type: "post",
            filter: {},
            max_items: 20,
          },
          ...parsedSteps,
        ],
        null,
        2,
      ),
    );
    setScopeMode("strict");
  };
  const removeResourceQuery = () => {
    if (!parsedSteps || resourceQueryIndex < 0) return;
    setSteps(
      JSON.stringify(
        parsedSteps.filter((_, index) => index !== resourceQueryIndex),
        null,
        2,
      ),
    );
  };
  const updateForEachFailurePolicy = (continueOnError: boolean) => {
    if (!parsedSteps || forEachIndex < 0) return;
    const nextSteps = [...parsedSteps];
    nextSteps[forEachIndex] = {
      ...nextSteps[forEachIndex],
      continue_on_error: continueOnError,
    };
    setSteps(JSON.stringify(nextSteps, null, 2));
  };
  const bindAgent = (id: number) => {
    const current = JSON.parse(steps) as WorkflowStep[];
    setSteps(JSON.stringify(bindWorkflowAgent(current, id), null, 2));
    const currentSchema = JSON.parse(schema) as { required?: unknown };
    if (Array.isArray(currentSchema.required))
      currentSchema.required = currentSchema.required.filter(
        (item) => item !== "agent_id",
      );
    setSchema(JSON.stringify(currentSchema, null, 2));
    setBoundAgentID(id);
  };
  const updateStep = (index: number, next: WorkflowStep) => {
    if (!parsedSteps) return;
    const value = [...parsedSteps];
    value[index] = next;
    setSteps(JSON.stringify(value, null, 2));
  };
  const moveStep = (index: number, delta: number) => {
    if (
      !parsedSteps ||
      index + delta < 0 ||
      index + delta >= parsedSteps.length
    )
      return;
    const value = [...parsedSteps];
    [value[index], value[index + delta]] = [value[index + delta], value[index]];
    const queryIndex = value.findIndex(
      (step) => step.type === "resource_query",
    );
    const controlIndex = value.findIndex(
      (step) => step.type === "model" || step.type === "for_each",
    );
    if (queryIndex >= 0 && controlIndex >= 0 && queryIndex > controlIndex) {
      const [query] = value.splice(queryIndex, 1);
      value.unshift(query);
    }
    setSteps(JSON.stringify(value, null, 2));
  };
  const removeStep = (index: number) => {
    if (parsedSteps)
      setSteps(
        JSON.stringify(
          parsedSteps.filter((_, item) => item !== index),
          null,
          2,
        ),
      );
  };
  const addStep = (type: WorkflowStep["type"]) => {
    if (!parsedSteps) return;
    const ids = new Set(parsedSteps.map((step) => step.id));
    let id = type === "resource_query" ? "select_resources" : type;
    let index = 2;
    while (ids.has(id)) id = `${type}_${index++}`;
    const step: WorkflowStep =
      type === "resource_query"
        ? { id, type, resource_type: "post", filter: {}, max_items: 20 }
        : type === "model"
          ? {
              id,
              type,
              input_pointer: "/input",
              include_context: true,
              agent_id: boundAgentID || undefined,
            }
          : type === "for_each"
            ? {
                id,
                type,
                collection_pointer: "/steps/select_resources",
                max_items: 20,
                max_concurrency: 0,
                steps: [],
              }
            : type === "approval_gate"
              ? { id, type, name: "人工审批", input_pointer: "/steps" }
              : { id, type, output_pointer: "/steps" };
    const value =
      type === "resource_query"
        ? [
            step,
            ...parsedSteps.filter((item) => item.type !== "resource_query"),
          ]
        : [...parsedSteps, step];
    setSteps(JSON.stringify(value, null, 2));
    if (type === "resource_query") setScopeMode("strict");
  };
  const generateDraft = async () => {
    if (!goal.trim()) {
      setPlannerMessage({
        type: "info",
        text: "先用一句话说明你希望自动化完成什么。",
      });
      return;
    }
    setPlanning(true);
    setPlannerMessage(null);
    try {
      const result = await workflowApi.draftWorkflow(goal.trim());
      setName(result.workflow.name);
      setDescription(result.workflow.description);
      setCronExpression(result.workflow.cron_expression || "");
      setTimezone(result.workflow.timezone || "Asia/Shanghai");
      setSchema(JSON.stringify(result.workflow.input_schema, null, 2));
      setSteps(JSON.stringify(result.workflow.steps, null, 2));
      setBoundAgentID(
        uniformWorkflowAgentID(result.workflow.steps || []) || "",
      );
      setTemplateKey(result.workflow.template_key || "");
      const binding = result.selected_agents
        ?.map(
          (agent) =>
            `${agent.name}${agent.skill_name ? ` · ${agent.skill_name}` : ""}`,
        )
        .join("、");
      setPlannerMessage({
        type: "success",
        text: result.planner_warning
          ? localizePlannerWarning(result.planner_warning, locale)
          : `${result.readiness?.message || "结构化意图、能力与数据流已通过校验。"} 已使用 ${binding || `${result.provider} · ${result.model}`} 生成未启用草案。请审阅后保存。`,
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setPlannerMessage({
        type: "error",
        text:
          message ||
          "规划结果未通过结构化意图、能力或数据流校验；未生成猜测性草案。",
      });
    } finally {
      setPlanning(false);
    }
  };
  const generateAgentDrafts = async () => {
    if (!goal.trim()) {
      setPlannerMessage({
        type: "info",
        text: "先描述 Workflow 目标，再生成所需的 Agent/Skill 草案。",
      });
      return;
    }
    setDraftingAgents(true);
    try {
      const result = await workflowApi.draftAgentSkills(goal.trim());
      setAgentDrafts(result.drafts);
      setPlannerMessage({
        type: "info",
        text: `AI 生成了 ${result.drafts.length} 个待审阅 Skill 草案；确认后只会创建停用的手动 Agent。`,
      });
    } catch (reason) {
      setPlannerMessage({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Agent/Skill 草案生成失败。",
      });
    } finally {
      setDraftingAgents(false);
    }
  };
  const materializeAgentDraft = async (draft: (typeof agentDrafts)[number]) => {
    setSavingAgentDraft(draft.name);
    try {
      const skill = await agentApi.saveAgentSkill({
        name: draft.name,
        description: draft.description,
        system_prompt: draft.system_prompt,
        capabilities: draft.capabilities,
        tool_bindings: {},
        execution_mode: "approval",
        content_publish_mode: "approval",
        max_steps: 6,
        max_input_tokens: 16000,
        max_output_tokens: 4000,
        default_daily_run_limit: 10,
        default_monthly_token_budget: 300000,
        input_schema: draft.input_schema || {
          type: "object",
          additionalProperties: true,
        },
        allowed_triggers: ["manual", "cron"],
      });
      await agentApi.saveAgent({
        name: draft.name,
        description: draft.description,
        skill_version_id: skill.version_id,
        enabled: false,
        trigger_type: "manual",
        timezone: "Asia/Shanghai",
        daily_run_limit: skill.default_daily_run_limit,
        monthly_token_budget: skill.default_monthly_token_budget,
      });
      setAgentDrafts((current) =>
        current.filter((item) => item.name !== draft.name),
      );
      setPlannerMessage({
        type: "success",
        text: `已创建停用的“${draft.name}” Agent/Skill。请到高级设置审阅并启用，然后重新生成 Workflow。`,
      });
    } catch (reason) {
      setPlannerMessage({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "保存 Agent/Skill 草案失败。",
      });
    } finally {
      setSavingAgentDraft(null);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedSchema = parseJSON<{
      properties?: Record<string, Record<string, unknown>>;
    }>(schema);
    const safeSteps = parseJSON<WorkflowStep[]>(steps);
    if (!parsedSchema || !safeSteps || !safeSteps.length) {
      setEditorError("输入 Schema 或步骤 JSON 无效，请在高级设置中修正。");
      setShowAdvanced(true);
      return;
    }
    if (
      safeSteps.some((step) =>
        [step.input_pointer, step.collection_pointer, step.output_pointer].some(
          (pointer) =>
            pointer !== undefined &&
            pointer !== "" &&
            !String(pointer).startsWith("/"),
        ),
      )
    ) {
      setEditorError("所有 JSON Pointer 必须以 / 开头。");
      return;
    }
    const hasResources =
      Object.values(parsedSchema.properties || {}).some(
        (property) => typeof property["x-gouno-resource"] === "string",
      ) || safeSteps.some((step) => step.type === "resource_query");
    await onSave({
      id: initial?.id,
      name,
      description,
      enabled: initial?.enabled || false,
      cron_expression: cronExpression.trim() || undefined,
      timezone,
      template_key: templateKey || undefined,
      input_schema: parsedSchema,
      steps: safeSteps,
      scope_policy: {
        mode: hasResources ? "strict" : scopeMode,
        discovery_tools: discoveryTools,
      },
      resource_query_empty_policy: emptyPolicy,
    });
  };
  return (
    <EditorPanel
      title={initial ? labels.editTitle : labels.createTitle}
      icon={<GitBranch />}
      closeLabel={labels.cancel}
      onClose={onCancel}
      surface={surface}
    >
      <FormLayout
        data-slot="workflow-editor-form"
        data-pattern="editor-form-composition"
        className="workflow-editor-form"
        onSubmit={submit}
      >
        {!initial ? (
          <section className="workflow-planner">
            <div>
              <h3>告诉 AI 你想持续完成什么</h3>
              <p>
                例如：“每天检查最近发布文章的
                SEO，并把需要人工确认的建议汇总出来”。AI
                只生成未启用草案，不会运行或修改内容。
              </p>
            </div>
            <Textarea
              rows={4}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="描述目标、频率、输入来源，以及哪些结果需要你确认…"
            />
            <FormActions>
              <Button
                variant="outline"
                type="button"
                disabled={planning}
                onClick={() => void generateDraft()}
                icon={<GitBranch />}
              >
                {planning ? "正在生成草案…" : "用 AI 生成 Workflow 草案"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={draftingAgents || planning}
                onClick={() => void generateAgentDrafts()}
                icon={<Plus />}
              >
                {draftingAgents
                  ? "正在生成 Agent 草案…"
                  : "没有合适 Agent？生成草案"}
              </Button>
            </FormActions>
            {plannerMessage ? (
              <div
                className={`workflow-planner__message workflow-planner__message--${plannerMessage.type}`}
                role={plannerMessage.type === "error" ? "alert" : "status"}
              >
                <span>{plannerMessage.text}</span>
              </div>
            ) : null}
            {agentDrafts.length ? (
              <div className="workflow-planner__agent-drafts">
                {agentDrafts.map((draft) => (
                  <article
                    key={draft.name}
                    className="workflow-planner__agent-draft"
                  >
                    <strong>{draft.name}</strong>
                    <p>{draft.description}</p>
                    <small>{draft.capabilities.join(" · ")}</small>
                    <Button
                      variant="outline"
                      className="justify-self-start"
                      type="button"
                      disabled={savingAgentDraft !== null}
                      onClick={() => void materializeAgentDraft(draft)}
                      icon={<Save />}
                    >
                      {savingAgentDraft === draft.name
                        ? "正在创建…"
                        : "确认创建停用 Agent"}
                    </Button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        <Field label="名称" hint="面向日常运营的短名称，例如“发布前内容检查”。">
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="作用说明"
          hint="说明此流程何时使用、会产出什么，以及人工确认边界。"
        >
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="form-grid workflow-schedule-grid">
          <Field
            label="Cron 执行计划"
            hint="留空表示仅手动运行；例如每天 09:00：0 9 * * *"
          >
            <Input
              className="font-mono"
              value={cronExpression}
              onChange={(event) => setCronExpression(event.target.value)}
              placeholder="0 9 * * *"
            />
          </Field>
          <Field label="时区" hint="使用 IANA 时区，例如 Asia/Shanghai">
            <Input
              className="font-mono"
              required
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </Field>
        </div>
        <SchemaFieldBuilder
          schemaJSON={schema}
          onChange={(value) => {
            setSchema(value);
            setEditorError("");
          }}
        />
        {parsedSteps ? (
          <ResourceQueryBuilder
            step={resourceQueryStep}
            onAdd={addResourceQuery}
            onChange={updateResourceQuery}
            onRemove={removeResourceQuery}
            savedPreview={initial?.resource_query_preview?.[0]?.estimated_count}
            lastCount={initial?.resource_query_last_count}
          />
        ) : (
          <Feedback type="error">
            步骤 JSON 无法解析。请先在高级设置中修正后再使用动态资源筛选。
          </Feedback>
        )}
        {resourceQueryStep ? (
          <Field
            label="空结果策略"
            hint="筛选为空时不调用 Agent；可选择成功短路或将运行标记为失败。"
          >
            <Select
              value={emptyPolicy}
              onChange={(value) =>
                setEmptyPolicy(selectValue(value) as "succeed" | "fail")
              }
              aria-label="空结果策略"
            >
              <option value="succeed">成功并记录“无匹配资源”</option>
              <option value="fail">失败并提醒管理员</option>
            </Select>
          </Field>
        ) : null}
        {forEachStep ? (
          <Field
            label="单项失败处理"
            hint="继续处理时会保留每项状态；至少一项成功则输出部分失败汇总，全部失败仍标记运行失败。"
          >
            <Select
              value={forEachStep.continue_on_error ? "continue" : "stop"}
              onChange={(value) =>
                updateForEachFailurePolicy(selectValue(value) === "continue")
              }
              aria-label="单项失败处理"
            >
              <option value="stop">立即停止整个运行</option>
              <option value="continue">继续处理其余资源</option>
            </Select>
          </Field>
        ) : null}
        {parsedSteps ? (
          <section className="workflow-step-cards">
            <div className="workflow-resource-query-heading">
              <div>
                <strong>步骤编排</strong>
                <p>常用步骤可视化编辑；高级 JSON 保留复杂配置。</p>
              </div>
              <Select
                aria-label="新增步骤类型"
                defaultValue="model"
                onChange={(value) =>
                  addStep(selectValue(value) as WorkflowStep["type"])
                }
              >
                <option value="model">添加模型步骤</option>
                <option value="resource_query">添加动态资源筛选</option>
                <option value="for_each">添加逐项处理</option>
                <option value="approval_gate">添加审批节点</option>
                <option value="output">添加输出节点</option>
              </Select>
            </div>
            {parsedSteps.map((step, index) => (
              <article
                className="workflow-step-card"
                key={`${step.id}-${index}`}
              >
                <header>
                  <strong>
                    {index + 1}. {step.name || step.id}
                  </strong>
                  <span className="risk-label risk-label--read">
                    {step.type}
                  </span>
                  <div className="agent-row-actions">
                    <IconButton
                      label="上移"
                      icon={<ArrowUp />}
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                    />
                    <IconButton
                      label="下移"
                      icon={<ArrowDown />}
                      disabled={index === parsedSteps.length - 1}
                      onClick={() => moveStep(index, 1)}
                    />
                    <IconButton
                      variant="ghost"
                      color="error"
                      label="删除"
                      icon={<Trash2 />}
                      onClick={() => removeStep(index)}
                    />
                  </div>
                </header>
                {step.type === "model" ? (
                  <div className="form-grid">
                    <Field label="步骤名称">
                      <Input
                        value={step.name || ""}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            name: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="输入 JSON Pointer">
                      <Input
                        className="font-mono"
                        value={step.input_pointer || ""}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            input_pointer: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="绑定 Agent">
                      <Select
                        value={step.agent_id ? String(step.agent_id) : ""}
                        onChange={(value) =>
                          updateStep(index, {
                            ...step,
                            agent_id: Number(selectValue(value)) || undefined,
                          })
                        }
                        aria-label="绑定 Agent"
                      >
                        <option value="">选择 Agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                            {agent.enabled ? "" : "（已停用）"}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <CheckboxField>
                      <Checkbox
                        checked={step.include_context !== false}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            include_context: event.target.checked,
                          })
                        }
                      />
                      <span>包含受控上下文</span>
                    </CheckboxField>
                  </div>
                ) : null}
                {step.type === "for_each" ? (
                  <div className="form-grid">
                    <Field label="集合 JSON Pointer">
                      <Input
                        className="font-mono"
                        value={step.collection_pointer || ""}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            collection_pointer: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="最多处理">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={step.max_items || 20}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            max_items: Math.max(
                              1,
                              Math.min(100, Number(event.target.value) || 1),
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="最大并发">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={step.max_concurrency || 0}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            max_concurrency: Math.max(
                              0,
                              Math.min(10, Number(event.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </Field>
                    <CheckboxField>
                      <Checkbox
                        checked={Boolean(step.continue_on_error)}
                        onChange={(event) =>
                          updateStep(index, {
                            ...step,
                            continue_on_error: event.target.checked,
                          })
                        }
                      />
                      <span>单项失败后继续</span>
                    </CheckboxField>
                  </div>
                ) : null}
                {step.type === "for_each" ? (
                  <div className="workflow-nested-steps">
                    <strong>嵌套模型步骤</strong>
                    {(step.steps || []).map((nested, nestedIndex) => (
                      <div className="form-grid" key={nested.id || nestedIndex}>
                        <Field label="步骤名称">
                          <Input
                            value={nested.name || ""}
                            onChange={(event) => {
                              const nestedSteps = [...(step.steps || [])];
                              nestedSteps[nestedIndex] = {
                                ...nested,
                                name: event.target.value,
                              };
                              updateStep(index, {
                                ...step,
                                steps: nestedSteps,
                              });
                            }}
                          />
                        </Field>
                        <Field label="绑定 Agent">
                          <Select
                            value={
                              nested.agent_id ? String(nested.agent_id) : ""
                            }
                            onChange={(value) => {
                              const nestedSteps = [...(step.steps || [])];
                              nestedSteps[nestedIndex] = {
                                ...nested,
                                agent_id:
                                  Number(selectValue(value)) || undefined,
                              };
                              updateStep(index, {
                                ...step,
                                steps: nestedSteps,
                              });
                            }}
                            aria-label="绑定 Agent"
                          >
                            <option value="">选择 Agent</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <IconButton
                          variant="ghost"
                          color="error"
                          label="删除嵌套步骤"
                          icon={<Trash2 />}
                          onClick={() =>
                            updateStep(index, {
                              ...step,
                              steps: (step.steps || []).filter(
                                (_, item) => item !== nestedIndex,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="small"
                      type="button"
                      onClick={() =>
                        updateStep(index, {
                          ...step,
                          steps: [
                            ...(step.steps || []),
                            {
                              id: `item_${(step.steps || []).length + 1}`,
                              type: "model",
                              input_pointer: "/item",
                              include_context: true,
                              agent_id: boundAgentID || undefined,
                            },
                          ],
                        })
                      }
                      icon={<Plus />}
                    >
                      添加嵌套模型步骤
                    </Button>
                  </div>
                ) : null}
                {step.type === "approval_gate" ? (
                  <Field className="workflow-step-field" label="审批说明">
                    <Input
                      value={step.name || ""}
                      onChange={(event) =>
                        updateStep(index, { ...step, name: event.target.value })
                      }
                    />
                  </Field>
                ) : null}
                {step.type === "output" ? (
                  <Field
                    className="workflow-step-field"
                    label="输出 JSON Pointer"
                  >
                    <Input
                      className="font-mono"
                      value={step.output_pointer || ""}
                      onChange={(event) =>
                        updateStep(index, {
                          ...step,
                          output_pointer: event.target.value,
                        })
                      }
                    />
                  </Field>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
        <Field
          label="批量绑定 Agent"
          hint="可选：将所有模型步骤改绑到同一个 Agent。多 Agent 草案默认留空，请在各步骤查看各自绑定。"
        >
          <Select
            value={boundAgentID === "" ? "" : String(boundAgentID)}
            onChange={(value) =>
              selectValue(value) && bindAgent(Number(selectValue(value)))
            }
            aria-label="批量绑定 Agent"
          >
            <option value="" disabled>
              选择 Agent
            </option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
                {agent.enabled ? "" : "（已停用）"}
              </option>
            ))}
          </Select>
        </Field>
        <section className="workflow-discovery-picker">
          <div className="workflow-resource-query-heading">
            <div>
              <strong>运行范围与只读发现 Tool</strong>
              <p>
                只展示当前绑定 Skill 已授权、且允许发现的只读
                Tool；发现结果默认不能成为修改目标。
              </p>
            </div>
            <Select
              aria-label="运行范围"
              value={scopeMode}
              onChange={(value) =>
                setScopeMode(selectValue(value) as "strict" | "unscoped")
              }
            >
              <option value="strict">严格限制</option>
              <option value="unscoped">兼容模式</option>
            </Select>
          </div>
          <Input
            size="small"
            value={toolQuery}
            onChange={(event) => setToolQuery(event.target.value)}
            placeholder="搜索可用 Tool"
            aria-label="搜索可用 Tool"
          />
          <div className="workflow-tool-picker">
            {authorizedDiscoveryTools.map((tool) => (
              <label key={tool.name}>
                <Checkbox
                  checked={discoveryTools.includes(tool.name)}
                  onChange={() =>
                    setDiscoveryTools((current) =>
                      current.includes(tool.name)
                        ? current.filter((item) => item !== tool.name)
                        : [...current, tool.name],
                    )
                  }
                />
                <span>
                  <strong>{tool.name}</strong>
                  <small>
                    {tool.description_zh || tool.description} · 发现后只读
                  </small>
                </span>
              </label>
            ))}
            {unavailableDiscoveryTools.map((tool) => (
              <label className="workflow-tool-picker__historical" key={tool}>
                <Checkbox
                  checked
                  onChange={() =>
                    setDiscoveryTools((current) =>
                      current.filter((item) => item !== tool),
                    )
                  }
                />
                <span>
                  <strong>{tool}</strong>
                  <small>
                    历史配置；当前 Skill 未授权，保存前请移除或切换兼容模式
                  </small>
                </span>
              </label>
            ))}
            {!authorizedDiscoveryTools.length &&
            !unavailableDiscoveryTools.length ? (
              <p className="muted">
                当前绑定 Skill 没有已授权的只读发现 Tool。
              </p>
            ) : null}
          </div>
        </section>
        <details
          className="workflow-advanced"
          open={showAdvanced}
          onToggle={(event) => setShowAdvanced(event.currentTarget.open)}
        >
          <summary>
            高级：查看或编辑输入与步骤 JSON{" "}
            <small>仅在需要精细控制或保留未来字段时修改</small>
          </summary>
          <p>
            结构化 UI 不支持的字段会保留在这里。手工编辑后必须是合法
            JSON，并继续接受服务端校验。
          </p>
          <Field
            label={labels.schema}
            hint="JSON Schema。资源字段使用 x-gouno-resource 和 x-gouno-widget 扩展。"
          >
            <Textarea
              className="font-mono"
              rows={8}
              value={schema}
              onChange={(event) => setSchema(event.target.value)}
            />
          </Field>
          <Field
            label={labels.steps}
            hint="允许 resource_query、model、for_each、approval_gate、output；服务端会校验每个步骤。"
          >
            <Textarea
              className="font-mono"
              rows={16}
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
            />
          </Field>
        </details>
        {editorError ? <Feedback type="error">{editorError}</Feedback> : null}
        <FormActions>
          <Button variant="outline" type="button" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button variant="solid" color="primary" type="submit" icon={<Save />}>
            {labels.save}
          </Button>
        </FormActions>
      </FormLayout>
    </EditorPanel>
  );
}
