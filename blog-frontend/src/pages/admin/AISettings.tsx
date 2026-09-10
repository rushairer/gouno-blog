import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { agentApi } from "../../api/agent";
import type {
  Agent,
  AgentRun,
  AgentSkill,
  EmbeddingProfile,
  ProviderProfile,
  ToolDefinition,
} from "../../types/agent";
import type { SkillFormValue } from "../../components/agent/SkillForm";
import type { ProviderFormValue } from "../../components/agent/ProviderForm";
import type { EmbeddingFormValue } from "../../components/agent/EmbeddingForm";
import { AdvancedWorkspace } from "../../components/agent/AdvancedWorkspace";
import type {
  AdvancedSection,
  DeleteTarget,
} from "../../components/agent/AdvancedWorkspace";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageState,
  Button,
  ConfirmDialog,
  ToastProvider,
  useToast,
} from "@gouno/ui-legacy";
import { useI18n } from "../../i18n";
import "../../styles/agent-console.css";

const SETTINGS_SECTIONS = new Set<AdvancedSection>([
  "agents",
  "skills",
  "tools",
  "knowledge",
  "providers",
  "connectors",
]);

function initialSettingsSection(): AdvancedSection {
  if (typeof window === "undefined") return "agents";
  const requested = new URLSearchParams(window.location.search).get("section");
  return requested && SETTINGS_SECTIONS.has(requested as AdvancedSection)
    ? (requested as AdvancedSection)
    : "agents";
}

function requestError(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function AISettingsContent() {
  const { locale, formatDateTime, t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const labels = new Proxy({} as Record<string, string>, {
    get: (_, prop: string) => t(`agent.${prop}` as any),
  });
  const [section, setSection] = useState<AdvancedSection>(
    initialSettingsSection,
  );
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<
    EmbeddingProfile[]
  >([]);
  const [indexStatus, setIndexStatus] = useState({
    queued: 0,
    failed: 0,
    chunks: 0,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
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
  const [testingConnections, setTestingConnections] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fallbackError = t("agent.requestFailed");

  const load = useCallback(async () => {
    const [
      providerData,
      embeddingData,
      indexData,
      agentData,
      runData,
      toolData,
      skillData,
    ] = await Promise.all([
      agentApi.getProviderProfiles(),
      agentApi.getEmbeddingProfiles(),
      agentApi.getIndexStatus(),
      agentApi.getAgents(),
      agentApi.getAgentRuns(100),
      agentApi.getToolCatalog(),
      agentApi.getAgentSkills(),
    ]);
    setProviders(providerData);
    setEmbeddingProfiles(embeddingData);
    setIndexStatus(indexData);
    setAgents(agentData);
    setRuns(runData || []);
    setTools(toolData);
    setSkills(skillData);
  }, []);

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

  const selectSection = (next: AdvancedSection) => {
    setEditingAgent(null);
    setEditingProvider(null);
    setEditingEmbedding(null);
    setEditingSkill(null);
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "agents") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  };

  const refresh = async () => {
    setError("");
    try {
      await load();
    } catch (reason) {
      setError(requestError(reason, fallbackError));
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
      setError(requestError(reason, fallbackError));
    }
  };

  const saveEmbedding = async (value: EmbeddingFormValue) => {
    setError("");
    try {
      await agentApi.saveEmbeddingProfile(value);
      setEditingEmbedding(null);
      await refresh();
    } catch (reason) {
      setError(requestError(reason, fallbackError));
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
      setError(requestError(reason, fallbackError));
    }
  };

  const saveSkill = async (value: SkillFormValue) => {
    setError("");
    try {
      await agentApi.saveAgentSkill(value);
      setEditingSkill(null);
      await refresh();
    } catch (reason) {
      setError(requestError(reason, fallbackError));
    }
  };

  const exportProviders = async () => {
    try {
      const blob = await agentApi.exportProviders();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `model-connections-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(requestError(reason, fallbackError));
    }
  };

  const handleImportProviders = async (
    event: ChangeEvent<HTMLInputElement>,
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
      setError(requestError(reason, fallbackError));
    }
  };

  const handleImportSkill = async (event: ChangeEvent<HTMLInputElement>) => {
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
      setError(requestError(reason, fallbackError));
    }
  };

  const exportSkill = async (skill: AgentSkill) => {
    try {
      const blob = await agentApi.exportSkill(skill.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `skill-${skill.id}-v${skill.version}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(requestError(reason, fallbackError));
    }
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
      setError(requestError(reason, fallbackError));
    }
  };

  const runAgent = async (agent: Agent) => {
    try {
      await mutate(() => agentApi.runAgent(agent.id));
      navigate("/admin/ai-ops?tab=records&record=agent");
    } catch (reason) {
      setError(requestError(reason, fallbackError));
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
      const message = requestError(reason, fallbackError);
      setError(`${name}：${message}`);
    } finally {
      setTestingConnections((current) =>
        current.filter((item) => item !== key),
      );
    }
  };

  const deleteSelected = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "agent") {
        await mutate(() => agentApi.deleteAgent(deleteTarget.value.id));
      } else if (deleteTarget.kind === "provider") {
        await mutate(() =>
          agentApi.deleteProviderProfile(deleteTarget.value.id),
        );
      } else if (deleteTarget.kind === "skill") {
        await mutate(() => agentApi.deleteAgentSkill(deleteTarget.value.id));
      } else {
        await mutate(() =>
          agentApi.deleteEmbeddingProfile(deleteTarget.value.id),
        );
      }
      setDeleteTarget(null);
    } catch (reason) {
      const message = requestError(reason, fallbackError);
      setError(message.replace(/^provider profile is in use:\s*/i, ""));
    }
  };

  const title = locale === "zh" ? "AI 设置" : "AI Settings";
  const description =
    locale === "zh"
      ? "管理长期稳定的 AI 能力、模型与连接器配置；运行、审批和执行证据留在 AI 运营。"
      : "Manage stable AI capabilities, models, and connector configuration. Runs, approvals, and execution evidence stay in AI Operations.";

  if (loading) {
    return (
      <AdminPageState
        title={title}
        description={description}
        label={locale === "zh" ? "正在加载 AI 设置…" : "Loading AI settings…"}
      />
    );
  }

  return (
    <AdminPage className="agent-console">
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <Button
            variant="secondary"
            size="compact"
            type="button"
            onClick={() => void refresh()}
            icon={<RefreshCw />}
          >
            {t("agent.refresh")}
          </Button>
        }
      />

      <AdvancedWorkspace
        locale={locale}
        labels={labels}
        advancedSection={section}
        onSelectSection={selectSection}
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
        onToggleAgentEnabled={async (agent) => {
          try {
            await mutate(() =>
              agentApi.setAgentEnabled(agent.id, !agent.enabled),
            );
          } catch (reason) {
            setError(requestError(reason, fallbackError));
          }
        }}
        onSetDefaultProvider={async (id, usage) => {
          try {
            await mutate(() => agentApi.setDefaultProvider(id, usage));
            const cleared = id === 0;
            if (locale === "zh") {
              setNotice(
                cleared
                  ? usage === "writing"
                    ? "已取消默认文本模型。"
                    : "已取消默认图片模型。"
                  : usage === "writing"
                    ? "默认文本模型已更新。"
                    : "默认图片模型已更新。",
              );
            } else {
              setNotice(
                cleared
                  ? usage === "writing"
                    ? "Cleared default text model."
                    : "Cleared default image model."
                  : usage === "writing"
                    ? "Default text model updated."
                    : "Default image model updated.",
              );
            }
          } catch (reason) {
            setError(requestError(reason, fallbackError));
          }
        }}
        onTestConnection={testConnection}
        onExportProviders={exportProviders}
        onImportProviders={handleImportProviders}
        onExportSkill={exportSkill}
        onImportSkill={handleImportSkill}
        onCopySkill={copySkill}
        onRetryIndex={async () => {
          try {
            await mutate(() => agentApi.retryIndex());
          } catch (reason) {
            setError(requestError(reason, fallbackError));
          }
        }}
        onRebuildIndex={async () => {
          try {
            await mutate(() => agentApi.rebuildIndex());
          } catch (reason) {
            setError(requestError(reason, fallbackError));
          }
        }}
        onDeleteTarget={setDeleteTarget}
        onError={setError}
        onRefresh={refresh}
        formatDateTime={formatDateTime}
      />

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

export default function AISettings() {
  return (
    <ToastProvider>
      <AISettingsContent />
    </ToastProvider>
  );
}
