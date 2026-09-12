import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Clock3,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { agentApi } from "../../api/agent";
import { operationsApi } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  Agent,
  AgentApproval,
  AgentRun,
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
  ToolDefinition,
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowRun,
} from "../../types/agent";
import { WorkspaceOverview } from "../../components/agent/WorkspaceOverview";
import type { ConsoleTab } from "../../components/agent/WorkspaceOverview";
import { InboxWorkspace } from "../../components/agent/InboxWorkspace";
import { RecordsWorkspace } from "../../components/agent/AgentRunRecords";
import { WorkflowWorkspace } from "../../components/agent/WorkflowWorkspace";
import { WorkflowRunRecords } from "../../components/agent/WorkflowRunRecords";
import { Button, Card, Segmented, Skeleton, Tabs, Tag } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { ToastProvider, useToast } from "@gouno/ui-legacy";
import { useI18n } from "../../i18n";
import "../../styles/agent-console.css";

const LEGACY_SETTINGS_SECTIONS = new Set([
  "agents",
  "skills",
  "tools",
  "knowledge",
  "providers",
  "connectors",
]);

function legacySettingsDestination(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") !== "advanced") return null;
  const section = params.get("section");
  return section && LEGACY_SETTINGS_SECTIONS.has(section)
    ? `/admin/ai-settings?section=${encodeURIComponent(section)}`
    : "/admin/ai-settings";
}

function initialConsoleTab(): ConsoleTab {
  if (typeof window === "undefined") return "overview";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested &&
    ["overview", "inbox", "automation", "records"].includes(requested)
    ? (requested as ConsoleTab)
    : "overview";
}

function initialRecordType(): "agent" | "workflow" {
  if (typeof window === "undefined") return "workflow";
  return new URLSearchParams(window.location.search).get("record") === "agent"
    ? "agent"
    : "workflow";
}

function AgentConsoleContent() {
  const { locale, formatDateTime, t } = useI18n();
  const { notify } = useToast();
  const [tab, setTab] = useState<ConsoleTab>(initialConsoleTab);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetric[]>([]);
  const [recordType, setRecordType] = useState<"agent" | "workflow">(
    initialRecordType,
  );
  const [suggestions, setSuggestions] = useState<OperationalSuggestion[]>([]);
  const [candidateSets, setCandidateSets] = useState<ContentCandidateSet[]>([]);
  const [mediaCandidates, setMediaCandidates] = useState<MediaCandidate[]>([]);
  const [interactions, setInteractions] = useState<WorkflowInteractionTask[]>(
    [],
  );
  const [editorialTasks, setEditorialTasks] = useState<EditorialTask[]>([]);
  const [selectedApproval, setSelectedApproval] =
    useState<AgentApproval | null>(null);
  const [selectedRun, setSelectedRun] = useState<{
    run: AgentRun;
    tool_calls: import("../../types/agent").AgentToolCall[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inspectedAgentRunFromURL = useRef(false);

  useEffect(() => {
    if (
      tab !== "records" ||
      recordType !== "agent" ||
      inspectedAgentRunFromURL.current
    )
      return;
    const requestedID = Number(
      new URLSearchParams(window.location.search).get("run"),
    );
    if (!requestedID) return;
    const requested = runs.find((run) => run.id === requestedID);
    if (!requested) {
      if (runs.length > 0) {
        inspectedAgentRunFromURL.current = true;
        agentApi
          .getAgentRunDetail(String(requestedID))
          .then(setSelectedRun)
          .catch(() => {});
      }
      return;
    }
    inspectedAgentRunFromURL.current = true;
    void inspectRun(requested);
  }, [tab, recordType, runs]);

  const selectTab = (nextTab: ConsoleTab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", url);
  };

  const load = useCallback(async () => {
    const loadWorkflowRuns = async () => {
      try {
        return await workflowApi.getRuns();
      } catch {
        return [] as WorkflowRun[];
      }
    };
    const [
      agentData,
      runData,
      approvalData,
      toolData,
      workflowData,
      workflowRunData,
      workflowMetricData,
      suggestionData,
      candidateData,
      mediaCandidateData,
      editorialTaskData,
    ] = await Promise.all([
      agentApi.getAgents(),
      agentApi.getAgentRuns(100),
      agentApi.getAgentApprovals("pending", 100),
      agentApi.getToolCatalog(),
      workflowApi.getWorkflows(),
      loadWorkflowRuns(),
      workflowApi.getMetrics(),
      operationsApi.getSuggestions("all"),
      operationsApi.getCandidates(),
      operationsApi.getMediaCandidates(),
      operationsApi.getEditorialTasks(),
    ]);
    setAgents(agentData);
    setRuns(runData || []);
    setApprovals(approvalData || []);
    setTools(toolData);
    setWorkflows(workflowData);
    setWorkflowRuns(workflowRunData);
    setWorkflowMetrics(workflowMetricData || []);
    setSuggestions(suggestionData);
    setCandidateSets(candidateData);
    setMediaCandidates(mediaCandidateData);
    setEditorialTasks(editorialTaskData);
    setSelectedApproval(
      (current) =>
        approvalData?.find((item) => item.id === current?.id) ||
        approvalData?.[0] ||
        null,
    );
  }, []);

  useEffect(() => {
    if (tab !== "inbox") return;
    void agentApi
      .getInteractions()
      .then(setInteractions)
      .catch(() => setInteractions([]));
  }, [tab]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    load()
      .catch((reason: Error) => {
        if (!ignore) setError(reason.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [load]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const pendingCount = approvals.filter(
    (item) => item.status === "pending",
  ).length;

  const refresh = async () => {
    setError("");
    try {
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const mutate = async (operation: () => Promise<unknown>) => {
    setError("");
    await operation();
    await refresh();
  };

  const saveWorkflow = async (value: {
    id?: number;
    name: string;
    description: string;
    enabled: boolean;
    cron_expression?: string;
    timezone: string;
    input_schema: Record<string, unknown>;
    steps: import("../../types/agent").WorkflowStep[];
    scope_policy: import("../../types/agent").WorkflowScopePolicy;
  }) => {
    await workflowApi.save(value);
    await refresh();
  };

  const queueWorkflow = async (
    workflowID: number,
    dryRun: boolean,
    input: Record<string, unknown>,
  ) => {
    setError("");
    const result = await workflowApi.run(workflowID, input, dryRun);
    await refresh();
    return result;
  };

  const preflightWorkflow = async (
    workflowID: number,
    dryRun: boolean,
    input: Record<string, unknown>,
  ) => workflowApi.preflight(workflowID, input, dryRun);

  const inspectRun = async (run: AgentRun) => {
    try {
      const detail = await agentApi.getAgentRunDetail(String(run.id));
      setSelectedRun(detail);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const review = async (approval: AgentApproval, approved: boolean) => {
    try {
      await mutate(() => agentApi.reviewApproval(approval.id, approved));
      const sourceRun = runs.find((run) => run.id === approval.run_id);
      if (approved && sourceRun?.workflow_run_id) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "records");
        url.searchParams.set("record", "workflow");
        url.searchParams.set("run", String(sourceRun.workflow_run_id));
        window.history.replaceState(null, "", url);
        setRecordType("workflow");
        setTab("records");
        setNotice(
          locale === "zh"
            ? "已批准。图片正在本次 Workflow 运行中生成，完成后可在此选择、预览和应用。"
            : "Approved. Images are generating in this Workflow Run; choose, preview, and apply them here when ready.",
        );
        return;
      }
      setNotice(approved ? t("agent.approve") : t("agent.reject"));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const deleteAgentRun = async (run: AgentRun) => {
    if (
      !window.confirm(
        locale === "zh"
          ? "删除这条终态 Agent 运行记录及其附属日志？文章和媒体文件不会被删除。"
          : "Delete this completed Agent run and its attached logs? Posts and media files are kept.",
      )
    )
      return;
    try {
      await mutate(() => agentApi.deleteAgentRun(String(run.id)));
      setSelectedRun(null);
      setNotice(locale === "zh" ? "运行记录已清理。" : "Run record deleted.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const pageHeader = (
    <PageHeader
      title={t("agent.title")}
      description={t("agent.pageDescription")}
      actions={
        <Button
          variant="outline"
          size="small"
          type="button"
          onClick={() => void refresh()}
          icon={<RefreshCw />}
        >
          {t("agent.refresh")}
        </Button>
      }
    />
  );

  if (loading)
    return (
      <div className="agent-console flex flex-col gap-6">
        {pageHeader}
        <div
          className="flex flex-col gap-6"
          role="status"
          aria-label={t("agent.loading")}
          aria-live="polite"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} padding="base">
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
          <Card padding="base">
            <Skeleton className="h-64 w-full" />
          </Card>
        </div>
      </div>
    );

  const tabs: Array<{ key: ConsoleTab; label: ReactNode }> = [
    {
      key: "overview",
      label: (
        <span className="inline-flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4" />
          <span>{t("agent.overview")}</span>
        </span>
      ),
    },
    {
      key: "inbox",
      label: (
        <span className="inline-flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4" />
          <span>{t("agent.inbox")}</span>
          {pendingCount > 0 ? <Tag color="warning">{pendingCount}</Tag> : null}
        </span>
      ),
    },
    {
      key: "automation",
      label: (
        <span className="inline-flex items-center gap-2">
          <GitBranch aria-hidden="true" className="size-4" />
          <span>{t("agent.automation")}</span>
        </span>
      ),
    },
    {
      key: "records",
      label: (
        <span className="inline-flex items-center gap-2">
          <Clock3 aria-hidden="true" className="size-4" />
          <span>{t("agent.records")}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="agent-console flex flex-col gap-6">
      {pageHeader}
      <Tabs<ConsoleTab>
        id="agent-workspace"
        activeKey={tab}
        items={tabs}
        onChange={selectTab}
        aria-label={t("agent.title")}
      />
      <div className="agent-console__main">
        {tab === "overview" ? (
          <WorkspaceOverview
            locale={locale}
            approvals={approvals}
            suggestions={suggestions}
            candidateSets={candidateSets}
            mediaCandidates={mediaCandidates}
            workflows={workflows}
            onNavigate={selectTab}
          />
        ) : null}

        {tab === "automation" ? (
          <WorkflowWorkspace
            workflows={workflows}
            runs={workflowRuns}
            metrics={workflowMetrics}
            agents={agents}
            tools={tools}
            locale={locale}
            onRun={queueWorkflow}
            onPreflight={preflightWorkflow}
            onRefresh={refresh}
            onSave={saveWorkflow}
          />
        ) : null}

        {tab === "inbox" ? (
          <InboxWorkspace
            locale={locale}
            approvals={approvals}
            selectedApproval={selectedApproval}
            onSelectApproval={setSelectedApproval}
            onReviewApproval={review}
            interactions={interactions}
            onResolvedInteraction={refresh}
            suggestions={suggestions}
            candidateSets={candidateSets}
            mediaCandidates={mediaCandidates}
            editorialTasks={editorialTasks}
            onRefresh={refresh}
          />
        ) : null}

        {tab === "records" ? (
          <div className="records-hub section-stack">
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
                onDelete={(run) => void deleteAgentRun(run)}
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
        ) : null}
      </div>
    </div>
  );
}

export default function AgentConsole() {
  const settingsDestination = legacySettingsDestination();
  if (settingsDestination) return <Navigate replace to={settingsDestination} />;
  return (
    <ToastProvider>
      <AgentConsoleContent />
    </ToastProvider>
  );
}
