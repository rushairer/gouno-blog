import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock3,
  GitBranch,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { agentApi } from "../../api/agent";
import { operationsApi } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  Agent,
  AgentApproval,
  AgentRun,
  AgentSkill,
  ContentCandidateSet,
  EditorialTask,
  EmbeddingProfile,
  MediaCandidate,
  OperationalSuggestion,
  ProviderProfile,
  ToolDefinition,
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowRun,
} from "../../types/agent";
import type { SkillFormValue } from "../../components/agent/SkillForm";
import type { ProviderFormValue } from "../../components/agent/ProviderForm";
import type { EmbeddingFormValue } from "../../components/agent/EmbeddingForm";
import { WorkspaceOverview } from "../../components/agent/WorkspaceOverview";
import type { ConsoleTab } from "../../components/agent/WorkspaceOverview";
import { InboxWorkspace } from "../../components/agent/InboxWorkspace";
import { AdvancedWorkspace } from "../../components/agent/AdvancedWorkspace";
import type {
  AdvancedSection,
  DeleteTarget,
} from "../../components/agent/AdvancedWorkspace";
import { RecordsWorkspace } from "../../components/agent/AgentRunRecords";
import { WorkflowWorkspace } from "../../components/agent/WorkflowWorkspace";
import { WorkflowRunRecords } from "../../components/agent/WorkflowRunRecords";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageState,
  Button,
  ConfirmDialog,
  SubnavTabs,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ToastProvider,
  useToast,
} from "../../components/ui";
import { useI18n } from "../../i18n";
import "../../styles/agent-console.css";

function initialConsoleTab(): ConsoleTab {
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested &&
    ["overview", "inbox", "automation", "records", "advanced"].includes(
      requested,
    )
    ? (requested as ConsoleTab)
    : "overview";
}

function initialRecordType(): "agent" | "workflow" {
  return new URLSearchParams(window.location.search).get("record") === "agent"
    ? "agent"
    : "workflow";
}

function AgentConsoleContent() {
  const { locale, formatDateTime, t } = useI18n();
  const { notify } = useToast();
  const labels = new Proxy({} as Record<string, string>, {
    get: (_, prop: string) => t(`agent.${prop}` as any),
  });
  const [tab, setTab] = useState<ConsoleTab>(initialConsoleTab);
  const [advancedSection, setAdvancedSection] =
    useState<AdvancedSection>("agents");
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<
    EmbeddingProfile[]
  >([]);
  const [indexStatus, setIndexStatus] = useState<{
    queued: number;
    failed: number;
    chunks: number;
  }>({ queued: 0, failed: 0, chunks: 0 });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
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
  const [editingAgent, setEditingAgent] = useState<Agent | "new" | null>(null);
  const [editingProvider, setEditingProvider] = useState<
    ProviderProfile | "new" | null
  >(null);
  const [editingEmbedding, setEditingEmbedding] = useState<
    EmbeddingProfile | "new" | null
  >(null);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | "new" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testingConnections, setTestingConnections] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
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
    const requested = runs.find((r) => r.id === requestedID);
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
    setEditingAgent(null);
    setEditingProvider(null);
    setEditingEmbedding(null);
    setEditingSkill(null);
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", url);
  };

  const selectAdvanced = (section: AdvancedSection) => {
    setEditingAgent(null);
    setEditingProvider(null);
    setEditingEmbedding(null);
    setEditingSkill(null);
    setAdvancedSection(section);
    setTab("advanced");
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
      providerData,
      embeddingData,
      indexData,
      agentData,
      runData,
      approvalData,
      toolData,
      skillData,
      workflowData,
      workflowRunData,
      workflowMetricData,
      suggestionData,
      candidateData,
      mediaCandidateData,
      editorialTaskData,
    ] = await Promise.all([
      agentApi.getProviderProfiles(),
      agentApi.getEmbeddingProfiles(),
      agentApi.getIndexStatus(),
      agentApi.getAgents(),
      agentApi.getAgentRuns(100),
      agentApi.getAgentApprovals("pending", 100),
      agentApi.getToolCatalog(),
      agentApi.getAgentSkills(),
      workflowApi.getWorkflows(),
      loadWorkflowRuns(),
      workflowApi.getMetrics(),
      operationsApi.getSuggestions("all"),
      operationsApi.getCandidates(),
      operationsApi.getMediaCandidates(),
      operationsApi.getEditorialTasks(),
    ]);
    setProviders(providerData);
    setEmbeddingProfiles(embeddingData);
    setIndexStatus(indexData);
    setAgents(agentData);
    setRuns(runData || []);
    setApprovals(approvalData || []);
    setTools(toolData);
    setSkills(skillData);
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
    if (error) {
      notify(error, "error");
      setError("");
    }
  }, [error, notify]);

  useEffect(() => {
    if (notice) {
      notify(notice, "success");
      setNotice("");
    }
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

  const saveProvider = async (value: ProviderFormValue) => {
    setError("");
    try {
      const result = await agentApi.saveProviderProfileWithSetup(value);
      setEditingProvider(null);
      await refresh();
      if (result.starter_agents_created > 0) {
        setNotice(
          locale === "zh"
            ? `已初始化 ${result.starter_agents_created} 个默认 Agent，全部保持停用，等待你审核启用。`
            : `Initialized ${result.starter_agents_created} default Agents. They remain disabled until reviewed.`,
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const saveEmbedding = async (value: EmbeddingFormValue) => {
    setError("");
    try {
      await agentApi.saveEmbeddingProfile(value);
      setEditingEmbedding(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const saveAgent = async (
    value: Omit<Agent, "id" | "created_at" | "updated_at"> & { id?: number },
  ) => {
    setError("");
    try {
      await agentApi.saveAgent(value);
      setEditingAgent(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const saveSkill = async (value: SkillFormValue) => {
    setError("");
    try {
      await agentApi.saveAgentSkill(value);
      setEditingSkill(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const exportProviders = async () => {
    const blob = await agentApi.exportProviders();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `model-connections-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProviders = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError(t("agent.invalidJsonFile"));
        return;
      }
      const data = await agentApi.importProviders(payload);
      await refresh();
      setNotice(
        locale === "zh"
          ? `已成功导入 ${data.imported_count} 个模型连接。`
          : `Successfully imported ${data.imported_count} model connections.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const handleImportSkill = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError(t("agent.invalidJsonFile"));
        return;
      }
      const data = await agentApi.importSkill(payload);
      await refresh();
      setNotice(
        locale === "zh"
          ? `已成功导入 Skill“${data.name || file.name}”。`
          : `Successfully imported Skill “${data.name || file.name}”.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const exportSkill = async (skill: AgentSkill) => {
    const blob = await agentApi.exportSkill(skill.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `skill-${skill.id}-v${skill.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copySkill = async (skill: AgentSkill) => {
    const name = window.prompt(
      locale === "zh" ? "复制后的 Skill 名称" : "Name for the copied Skill",
      `${skill.name} Copy`,
    );
    if (!name?.trim()) return;
    try {
      await mutate(() => agentApi.copySkill(skill.id, name.trim()));
      setNotice(
        locale === "zh"
          ? `已创建 Skill“${name.trim()}”的自定义副本。`
          : `Created custom Skill copy “${name.trim()}”.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
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
  ) => {
    return workflowApi.preflight(workflowID, input, dryRun);
  };

  const runAgent = async (agent: Agent) => {
    try {
      await mutate(() => agentApi.runAgent(agent.id));
      selectTab("records");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("agent.requestFailed"),
      );
    }
  };

  const testConnection = async (
    kind: "provider" | "embedding",
    id: number,
    name: string,
  ) => {
    const key = `${kind}:${id}`;
    setTestingConnections((current) =>
      current.includes(key) ? current : [...current, key],
    );
    setError("");
    setNotice("");
    try {
      await (kind === "provider"
        ? agentApi.testProvider(id)
        : agentApi.testEmbedding(id));
      setNotice(
        locale === "zh" ? `${name}：连接成功` : `${name}: connection succeeded`,
      );
    } catch (reason) {
      setError(
        locale === "zh"
          ? `${name}：${reason instanceof Error ? reason.message : t("agent.requestFailed")}`
          : `${name}: ${reason instanceof Error ? reason.message : t("agent.requestFailed")}`,
      );
    } finally {
      setTestingConnections((current) =>
        current.filter((item) => item !== key),
      );
    }
  };

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

  const deleteSelected = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "agent")
        await mutate(() => agentApi.deleteAgent(deleteTarget.value.id));
      else if (deleteTarget.kind === "provider")
        await mutate(() =>
          agentApi.deleteProviderProfile(deleteTarget.value.id),
        );
      else if (deleteTarget.kind === "skill")
        await mutate(() => agentApi.deleteAgentSkill(deleteTarget.value.id));
      else
        await mutate(() =>
          agentApi.deleteEmbeddingProfile(deleteTarget.value.id),
        );
      setDeleteTarget(null);
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : t("agent.requestFailed");
      const cleanMsg = msg.replace(/^provider profile is in use:\s*/i, "");
      setError(cleanMsg);
    }
  };

  if (loading)
    return (
      <AdminPageState
        title={t("agent.title")}
        description={t("agent.pageDescription")}
        label={t("agent.loading")}
      />
    );

  const tabs = [
    ["overview", Sparkles, t("agent.overview")],
    ["inbox", ShieldCheck, t("agent.inbox")],
    ["automation", GitBranch, t("agent.automation")],
    ["records", Clock3, t("agent.records")],
    ["advanced", Settings2, t("agent.advanced")],
  ] as const;

  return (
    <AdminPage className="agent-console">
      <AdminPageHeader
        title={t("agent.title")}
        description={t("agent.pageDescription")}
        actions={
          <Button
            variant="secondary"
            type="button"
            onClick={() => void refresh()}
          >
            <RefreshCw />
            {t("agent.refresh")}
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => selectTab(value as ConsoleTab)}
        id="agent-workspace"
      >
        <TabList label={t("agent.title")}>
          {tabs.map(([value, Icon, label]) => (
            <Tab key={value} value={value}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {value === "inbox" && pendingCount > 0 ? (
                <b>{pendingCount}</b>
              ) : null}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={tab}>
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
                <SubnavTabs
                  label={locale === "zh" ? "运行中心类型" : "Run center type"}
                  value={recordType}
                  onValueChange={(value) => {
                    const next = value as typeof recordType;
                    setRecordType(next);
                    const url = new URL(window.location.href);
                    url.searchParams.set("record", next);
                    window.history.replaceState(null, "", url);
                  }}
                  items={[
                    {
                      value: "workflow",
                      label:
                        locale === "zh" ? "Workflow 任务" : "Workflow tasks",
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

            {tab === "advanced" ? (
              <AdvancedWorkspace
                locale={locale}
                labels={labels}
                advancedSection={advancedSection}
                onSelectSection={selectAdvanced}
                agents={agents}
                skills={skills}
                tools={tools}
                providers={providers}
                embeddingProfiles={embeddingProfiles}
                runs={runs}
                indexStatus={indexStatus}
                editingAgent={editingAgent}
                editingProvider={editingProvider}
                editingEmbedding={editingEmbedding}
                editingSkill={editingSkill}
                testingConnections={testingConnections}
                onEditAgent={setEditingAgent}
                onEditProvider={setEditingProvider}
                onEditEmbedding={setEditingEmbedding}
                onEditSkill={setEditingSkill}
                onSaveAgent={saveAgent}
                onSaveProvider={saveProvider}
                onSaveEmbedding={saveEmbedding}
                onSaveSkill={saveSkill}
                onRunAgent={runAgent}
                onToggleAgentEnabled={(agent) =>
                  mutate(() =>
                    agentApi.setAgentEnabled(agent.id, !agent.enabled),
                  ).catch((reason: Error) => setError(reason.message))
                }
                onSetDefaultProvider={(id, usage) =>
                  mutate(() => agentApi.setDefaultProvider(id, usage))
                    .then(() =>
                      setNotice(
                        id === 0
                          ? locale === "zh"
                            ? usage === "writing"
                              ? "已取消默认文本模型。"
                              : "已取消默认图片模型。"
                            : usage === "writing"
                              ? "Cleared default text model."
                              : "Cleared default image model."
                          : locale === "zh"
                            ? usage === "writing"
                              ? "默认文本模型已更新。"
                              : "默认图片模型已更新。"
                            : usage === "writing"
                              ? "Default text model updated."
                              : "Default image model updated.",
                      ),
                    )
                    .catch((reason: Error) => setError(reason.message))
                }
                onTestConnection={testConnection}
                onExportProviders={exportProviders}
                onImportProviders={handleImportProviders}
                onExportSkill={(skill) =>
                  exportSkill(skill).catch((reason: Error) =>
                    setError(reason.message),
                  )
                }
                onImportSkill={handleImportSkill}
                onCopySkill={copySkill}
                onRetryIndex={() => mutate(() => agentApi.retryIndex())}
                onRebuildIndex={() => mutate(() => agentApi.rebuildIndex())}
                onDeleteTarget={setDeleteTarget}
                onError={setError}
                onRefresh={refresh}
                formatDateTime={formatDateTime}
              />
            ) : null}
          </div>
        </TabPanel>
      </Tabs>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === "agent"
            ? t("agent.deleteAgentConfirm")
            : deleteTarget?.kind === "embedding"
              ? t("agent.deleteEmbeddingConfirm")
              : deleteTarget?.kind === "skill"
                ? t("agent.deleteSkillConfirm")
                : t("agent.deleteProviderConfirm")
        }
        description={
          deleteTarget?.kind === "agent"
            ? t("agent.deleteAgentConfirm")
            : deleteTarget?.kind === "embedding"
              ? t("agent.deleteEmbeddingConfirm")
              : deleteTarget?.kind === "skill"
                ? t("agent.deleteSkillConfirm")
                : t("agent.deleteProviderConfirm")
        }
        confirmLabel={t("agent.delete")}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteSelected}
      />
    </AdminPage>
  );
}

export default function AgentConsole() {
  return (
    <ToastProvider>
      <AgentConsoleContent />
    </ToastProvider>
  );
}
