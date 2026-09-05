import { useRef } from "react";
import {
  Bot,
  CirclePause,
  Copy,
  DatabaseZap,
  Download,
  Edit2,
  GitBranch,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  Agent,
  AgentRun,
  AgentSkill,
  EmbeddingProfile,
  ProviderProfile,
  ToolDefinition,
} from "../../types/agent";
import { AgentForm } from "./AgentForm";
import { SkillForm } from "./SkillForm";
import type { SkillFormValue } from "./SkillForm";
import { ProviderForm } from "./ProviderForm";
import type { ProviderFormValue } from "./ProviderForm";
import { EmbeddingForm } from "./EmbeddingForm";
import type { EmbeddingFormValue } from "./EmbeddingForm";
import { ConnectorWorkspace } from "./ConnectorWorkspace";
import { RiskPill, StatusPill } from "./StatusPill";
import { SudoGate } from "../auth/SudoGate";
import {
  Button,
  EmptyState,
  IconButton,
  PanelHeader,
  Select,
  SubnavTabs,
  WorkspacePanel,
} from "@gouno/ui";

export type AdvancedSection =
  | "agents"
  | "skills"
  | "tools"
  | "knowledge"
  | "providers"
  | "connectors";
export type DeleteTarget =
  | { kind: "agent"; value: Agent }
  | { kind: "provider"; value: ProviderProfile }
  | { kind: "embedding"; value: EmbeddingProfile }
  | { kind: "skill"; value: AgentSkill }
  | null;

function formatCapability(value: string) {
  return value.replace(".", " / ").replaceAll("_", " ");
}

interface AdvancedWorkspaceProps {
  locale: "en" | "zh";
  labels: Record<string, string>;
  advancedSection: AdvancedSection;
  onSelectSection: (section: AdvancedSection) => void;
  // Entities
  agents: Agent[];
  skills: AgentSkill[];
  tools: ToolDefinition[];
  providers: ProviderProfile[];
  embeddingProfiles: EmbeddingProfile[];
  runs: AgentRun[];
  indexStatus: { queued: number; failed: number; chunks: number };
  // Form editing states
  editingAgent: Agent | "new" | null;
  editingProvider: ProviderProfile | "new" | null;
  editingEmbedding: EmbeddingProfile | "new" | null;
  editingSkill: AgentSkill | "new" | null;
  testingConnections: string[];
  // Actions
  onEditAgent: (agent: Agent | "new" | null) => void;
  onEditProvider: (provider: ProviderProfile | "new" | null) => void;
  onEditEmbedding: (embedding: EmbeddingProfile | "new" | null) => void;
  onEditSkill: (skill: AgentSkill | "new" | null) => void;
  onSaveAgent: (
    value: Omit<Agent, "id" | "created_at" | "updated_at"> & { id?: number },
  ) => Promise<void>;
  onSaveProvider: (value: ProviderFormValue) => Promise<void>;
  onSaveEmbedding: (value: EmbeddingFormValue) => Promise<void>;
  onSaveSkill: (value: SkillFormValue) => Promise<void>;
  onRunAgent: (agent: Agent) => Promise<void>;
  onToggleAgentEnabled: (agent: Agent) => Promise<void>;
  onSetDefaultProvider: (
    id: number,
    usage: "writing" | "image",
  ) => Promise<void>;
  onTestConnection: (
    kind: "provider" | "embedding",
    id: number,
    name: string,
  ) => Promise<void>;
  onExportProviders: () => Promise<void>;
  onImportProviders: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onExportSkill: (skill: AgentSkill) => Promise<void>;
  onImportSkill: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onCopySkill: (skill: AgentSkill) => Promise<void>;
  onRetryIndex: () => Promise<void>;
  onRebuildIndex: () => Promise<void>;
  onDeleteTarget: (target: DeleteTarget) => void;
  onError: (msg: string) => void;
  onRefresh: () => Promise<void>;
  formatDateTime: (value: string) => string;
}

export function AdvancedWorkspace({
  locale,
  labels,
  advancedSection,
  onSelectSection,
  agents,
  skills,
  tools,
  providers,
  embeddingProfiles,
  runs,
  indexStatus,
  editingAgent,
  editingProvider,
  editingEmbedding,
  editingSkill,
  testingConnections,
  onEditAgent,
  onEditProvider,
  onEditEmbedding,
  onEditSkill,
  onSaveAgent,
  onSaveProvider,
  onSaveEmbedding,
  onSaveSkill,
  onRunAgent,
  onToggleAgentEnabled,
  onSetDefaultProvider,
  onTestConnection,
  onExportProviders,
  onImportProviders,
  onExportSkill,
  onImportSkill,
  onCopySkill,
  onRetryIndex,
  onRebuildIndex,
  onDeleteTarget,
  onError,
  onRefresh,
  formatDateTime,
}: AdvancedWorkspaceProps) {
  const providerFileInputRef = useRef<HTMLInputElement>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);
  const providerMap = new Map(providers.map((item) => [item.id, item]));

  return (
    <>
      <SubnavTabs
        aria-label={labels.advanced}
        value={advancedSection}
        onValueChange={(value) => onSelectSection(value as AdvancedSection)}
        items={[
          { value: "agents", label: labels.agents, icon: <Bot /> },
          { value: "skills", label: labels.skills, icon: <ListChecks /> },
          { value: "tools", label: "Tools", icon: <GitBranch /> },
          {
            value: "knowledge",
            label: labels.knowledge,
            icon: <DatabaseZap />,
          },
          { value: "providers", label: labels.providers, icon: <KeyRound /> },
          {
            value: "connectors",
            label: locale === "zh" ? "Sandbox 连接器" : "Sandbox connectors",
            icon: <LockKeyhole />,
          },
        ]}
      />

      {advancedSection === "providers" && editingProvider ? (
        <ProviderForm
          key={editingProvider === "new" ? "new" : editingProvider.id}
          initial={editingProvider === "new" ? undefined : editingProvider}
          labels={labels}
          onSave={onSaveProvider}
          onCancel={() => onEditProvider(null)}
        />
      ) : null}

      {advancedSection === "knowledge" && editingEmbedding ? (
        <EmbeddingForm
          key={editingEmbedding === "new" ? "new" : editingEmbedding.id}
          initial={editingEmbedding === "new" ? undefined : editingEmbedding}
          locale={locale}
          onSave={onSaveEmbedding}
          onCancel={() => onEditEmbedding(null)}
        />
      ) : null}

      {advancedSection === "agents" && editingAgent ? (
        <AgentForm
          key={editingAgent === "new" ? "new" : editingAgent.id}
          initial={editingAgent === "new" ? undefined : editingAgent}
          providers={providers}
          skills={skills}
          locale={locale}
          labels={labels}
          onSave={onSaveAgent}
          onCancel={() => onEditAgent(null)}
        />
      ) : null}

      {advancedSection === "skills" && editingSkill ? (
        <SkillForm
          key={editingSkill === "new" ? "new" : editingSkill.id}
          initial={editingSkill === "new" ? undefined : editingSkill}
          tools={tools}
          locale={locale}
          onSave={onSaveSkill}
          onCancel={() => onEditSkill(null)}
        />
      ) : null}

      {!editingAgent && !editingProvider && advancedSection === "tools" ? (
        <WorkspacePanel className="agent-table-panel">
          <PanelHeader
            title="Tools"
            description={
              locale === "zh"
                ? "由代码发布的受控能力目录，供 Skill 和 Agent 授权、审计与测试；Workflow 不直接调用 Tool。"
                : "Code-published governed capabilities for Skill and Agent authorization, audit, and testing. Workflows do not invoke Tools directly."
            }
          />
          {tools.length === 0 ? (
            <EmptyState label={locale === "zh" ? "暂无 Tool" : "No Tools"} />
          ) : (
            <div className="table-scroll">
              <table className="content-table agent-table agent-table--tools">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>{locale === "zh" ? "范围" : "Surface"}</th>
                    <th>{locale === "zh" ? "风险" : "Risk"}</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.name}>
                      <td>
                        <strong>{tool.name}</strong>
                        <small>
                          {locale === "zh"
                            ? tool.description_zh || tool.description
                            : tool.description}
                        </small>
                      </td>
                      <td>{tool.surfaces?.join(", ") || "agent"}</td>
                      <td>
                        <RiskPill risk={tool.risk_level} locale={locale} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkspacePanel>
      ) : null}

      {!editingAgent && !editingProvider && advancedSection === "agents" ? (
        <WorkspacePanel className="agent-table-panel">
          <PanelHeader
            title={labels.agents}
            description={
              locale === "zh"
                ? "将 Skill Version 部署到模型连接，并配置运行配额、计划与启停。"
                : "Deploy a Skill Version to a model connection, then configure scheduling, quotas, and state."
            }
            actions={
              <Button
                variant="primary"
                onClick={() =>
                  providers.length > 0
                    ? onEditAgent("new")
                    : onError(labels.providerNeeded)
                }
                icon={<Plus />}
              >
                {labels.createAgent}
              </Button>
            }
          />
          {agents.length === 0 ? (
            <div className="agent-empty-state">
              <Bot aria-hidden="true" />
              <h2>
                {locale === "zh"
                  ? "先添加模型连接"
                  : "Add a model connection first"}
              </h2>
              <p>
                {locale === "zh"
                  ? "保存首个可用模型连接后，系统会自动创建 8 个停用的默认 Agent，供你审核后启用。"
                  : "Saving the first usable model connection creates eight disabled default Agents for review."}
              </p>
              <Button
                className="text-link"
                variant="ghost"
                onClick={() => onSelectSection("providers")}
                icon={<KeyRound />}
              >
                {locale === "zh"
                  ? "配置模型连接"
                  : "Configure a model connection"}
              </Button>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="content-table agent-table agent-table--agents">
                <thead>
                  <tr>
                    <th>{labels.agents}</th>
                    <th>{labels.status}</th>
                    <th>{labels.provider}</th>
                    <th>{labels.capabilities}</th>
                    <th>{labels.scheduleAndRun || labels.schedule}</th>
                    <th className="text-right">{labels.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const defaultWritingProvider = providers.find(
                      (p) => p.enabled && p.is_default_writing,
                    );
                    const provider = agent.provider_profile_id
                      ? providerMap.get(agent.provider_profile_id)
                      : defaultWritingProvider;
                    const isInherited = !agent.provider_profile_id;
                    const latestRun = runs.find(
                      (run) => run.agent_id === agent.id,
                    );
                    const toolsForSkill = agent.skill?.capabilities || [];
                    return (
                      <tr key={agent.id}>
                        <td>
                          <div className="agent-identity">
                            <span>
                              <Bot />
                            </span>
                            <div>
                              <strong>{agent.name}</strong>
                              {agent.system_key ? (
                                <small className="agent-identity__tag">
                                  {locale === "zh"
                                    ? "默认能力"
                                    : "Default capability"}
                                </small>
                              ) : null}
                              <small>{agent.description}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`agent-state agent-state--${agent.enabled ? "active" : "paused"}`}
                          >
                            <i />
                            {agent.enabled ? labels.active : labels.paused}
                          </span>
                        </td>
                        <td>
                          <div className="provider-identity">
                            <strong>
                              {provider?.name ||
                                (locale === "zh"
                                  ? "跟随系统默认"
                                  : "Inherit Default")}
                            </strong>
                            {isInherited ? (
                              <span className="status-pill status-pill--published">
                                {locale === "zh"
                                  ? "跟随系统"
                                  : "Inherit system"}
                              </span>
                            ) : (
                              <small className="mono">
                                {provider?.model || "—"}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="agent-skill-identity">
                            <strong>{agent.skill?.name || "—"}</strong>
                            <small>
                              v{agent.skill?.version || "—"} ·{" "}
                              {toolsForSkill.length} Tools
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="agent-schedule-cell">
                            <div className="agent-schedule-main">
                              <strong>
                                {agent.trigger_type === "cron"
                                  ? agent.cron_expression
                                  : labels.manual}
                              </strong>
                              {agent.trigger_type === "cron" &&
                              agent.timezone ? (
                                <small>{agent.timezone}</small>
                              ) : null}
                            </div>
                            <div className="agent-schedule-meta">
                              {latestRun ? (
                                <div className="agent-schedule-last-run">
                                  <StatusPill
                                    status={latestRun.status}
                                    locale={locale}
                                  />
                                  <small>
                                    {formatDateTime(latestRun.created_at)}
                                  </small>
                                </div>
                              ) : (
                                <small className="text-muted">
                                  {labels.never}
                                </small>
                              )}
                              {agent.trigger_type === "cron" &&
                              agent.next_run_at ? (
                                <small className="agent-schedule-next">
                                  {locale === "zh" ? "下次: " : "Next: "}
                                  {formatDateTime(agent.next_run_at)}
                                </small>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="agent-row-actions">
                            <IconButton
                              label={labels.runNow}
                              icon={<Play />}
                              onClick={() => void onRunAgent(agent)}
                              disabled={!agent.enabled}
                            />
                            <IconButton
                              label={labels.edit}
                              icon={<Edit2 />}
                              onClick={() => onEditAgent(agent)}
                            />
                            <IconButton
                              label={
                                agent.enabled ? labels.disable : labels.enable
                              }
                              icon={agent.enabled ? <CirclePause /> : <Play />}
                              onClick={() => void onToggleAgentEnabled(agent)}
                            />
                            {!agent.system_key ? (
                              <IconButton
                                variant="danger"
                                label={labels.delete}
                                icon={<Trash2 />}
                                onClick={() =>
                                  onDeleteTarget({
                                    kind: "agent",
                                    value: agent,
                                  })
                                }
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WorkspacePanel>
      ) : null}

      {!editingAgent &&
      !editingProvider &&
      !editingSkill &&
      advancedSection === "skills" ? (
        <WorkspacePanel className="agent-table-panel">
          <input
            ref={skillFileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void onImportSkill(event)}
          />
          <PanelHeader
            title={labels.skills}
            description={
              locale === "zh"
                ? "管理可复用能力定义与执行边界。"
                : "Manage reusable capability definitions and execution boundaries."
            }
            actions={
              <>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => skillFileInputRef.current?.click()}
                  icon={<Upload />}
                >
                  {locale === "zh" ? "导入 Skill" : "Import Skill"}
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => onEditSkill("new")}
                  icon={<Plus />}
                >
                  {locale === "zh" ? "创建 Skill" : "Create Skill"}
                </Button>
              </>
            }
          />
          {skills.length === 0 ? (
            <EmptyState label={labels.noSkills} />
          ) : (
            <div className="table-scroll">
              <table className="content-table agent-table">
                <thead>
                  <tr>
                    <th>{labels.skills}</th>
                    <th>{labels.mode}</th>
                    <th>{labels.capabilities}</th>
                    <th>Version</th>
                    <th>{labels.created}</th>
                    <th>{labels.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <strong>{skill.name}</strong>
                        {skill.system_key ? (
                          <small>
                            {locale === "zh" ? "系统 Skill" : "System Skill"}
                          </small>
                        ) : null}
                        <small>{skill.description}</small>
                      </td>
                      <td>
                        <span
                          className={`risk-label risk-label--${
                            skill.execution_mode === "approval"
                              ? "propose"
                              : "read"
                          }`}
                        >
                          {skill.execution_mode === "approval"
                            ? labels.approvalMode
                            : labels.advisory}
                        </span>
                      </td>
                      <td>
                        <div className="agent-chip-list">
                          {skill.capabilities.slice(0, 4).map((item) => (
                            <span key={item}>{formatCapability(item)}</span>
                          ))}
                          {skill.capabilities.length > 4 ? (
                            <span>+{skill.capabilities.length - 4}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <strong>v{skill.version}</strong>
                      </td>
                      <td>
                        <small>{formatDateTime(skill.updated_at)}</small>
                      </td>
                      <td>
                        <div className="agent-row-actions">
                          <IconButton
                            label={
                              locale === "zh" ? "导出 Skill" : "Export Skill"
                            }
                            icon={<Download />}
                            onClick={() => void onExportSkill(skill)}
                          />
                          <IconButton
                            label={
                              locale === "zh" ? "复制 Skill" : "Copy Skill"
                            }
                            icon={<Copy />}
                            onClick={() => void onCopySkill(skill)}
                          />
                          <IconButton
                            label={labels.edit}
                            icon={<Edit2 />}
                            onClick={() => onEditSkill(skill)}
                          />
                          {!skill.system_key ? (
                            <IconButton
                              variant="danger"
                              label={labels.delete}
                              icon={<Trash2 />}
                              onClick={() =>
                                onDeleteTarget({ kind: "skill", value: skill })
                              }
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkspacePanel>
      ) : null}

      {!editingAgent && !editingProvider && advancedSection === "providers" ? (
        <SudoGate
          title="模型连接与密钥保护"
          description="添加、修改、导出或删除 AI 模型连接涉及敏感 API Key 凭据。解锁后享有 10 分钟无打扰编辑期。"
          actionLabel="解锁以管理模型连接"
        >
          <WorkspacePanel className="agent-table-panel">
            <input
              ref={providerFileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void onImportProviders(event)}
            />
            <PanelHeader
              title={labels.providers}
              description={
                locale === "zh"
                  ? "管理模型连接，并分别指定文本模型与图片生成的默认模型。"
                  : "Manage model connections and defaults."
              }
              actions={
                <>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void onExportProviders()}
                    icon={<Download />}
                  >
                    {labels.exportProviders}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => providerFileInputRef.current?.click()}
                    icon={<Upload />}
                  >
                    {labels.importProviders}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onEditProvider("new")}
                    icon={<Plus />}
                  >
                    {locale === "zh" ? "添加模型连接" : labels.createProvider}
                  </Button>
                </>
              }
            />
            {providers.length > 0 ? (
              <section className="provider-defaults">
                <div className="provider-defaults__intro">
                  <h3>{locale === "zh" ? "默认用途" : "Default Purposes"}</h3>
                  <p>
                    {locale === "zh"
                      ? "决定编辑器、运营分析与图片生成使用的模型。"
                      : "Determines models used for editing, analysis, and image generation."}
                  </p>
                </div>
                <label>
                  {locale === "zh" ? "文本模型" : "Text Model"}
                  <Select
                    value={
                      providers.find((item) => item.is_default_writing)?.id ||
                      ""
                    }
                    onChange={(event) => {
                      const id = event.target.value
                        ? Number(event.target.value)
                        : 0;
                      void onSetDefaultProvider(id, "writing");
                    }}
                  >
                    <option value="">
                      {locale === "zh"
                        ? "未设置 (取消选择)"
                        : "Not set (Clear default)"}
                    </option>
                    {providers
                      .filter((item) => item.enabled)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.model}
                        </option>
                      ))}
                  </Select>
                </label>
                <label>
                  {locale === "zh" ? "图片生成" : "Image Generation"}
                  <Select
                    value={
                      providers.find((item) => item.is_default_image)?.id || ""
                    }
                    onChange={(event) => {
                      const id = event.target.value
                        ? Number(event.target.value)
                        : 0;
                      void onSetDefaultProvider(id, "image");
                    }}
                  >
                    <option value="">
                      {locale === "zh"
                        ? "未设置 (取消选择)"
                        : "Not set (Clear default)"}
                    </option>
                    {providers
                      .filter((item) => item.enabled)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.model}
                        </option>
                      ))}
                  </Select>
                </label>
              </section>
            ) : null}
            {providers.length === 0 ? (
              <EmptyState label={labels.noProviders} />
            ) : (
              <div className="table-scroll">
                <table className="content-table agent-table">
                  <thead>
                    <tr>
                      <th>{labels.providerName}</th>
                      <th>{labels.providerType}</th>
                      <th>{labels.baseUrl}</th>
                      <th>{labels.model}</th>
                      <th>{labels.apiKey}</th>
                      <th>{labels.status}</th>
                      <th>{labels.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((provider) => (
                      <tr key={provider.id}>
                        <td>
                          <div className="provider-identity">
                            <strong>{provider.name}</strong>
                            {(provider.is_default_writing ||
                              provider.is_default_image) && (
                              <div className="provider-tags">
                                {provider.is_default_writing ? (
                                  <span className="status-pill status-pill--published">
                                    {locale === "zh"
                                      ? "默认文本模型"
                                      : "Default Text Model"}
                                  </span>
                                ) : null}
                                {provider.is_default_image ? (
                                  <span className="status-pill status-pill--published">
                                    {locale === "zh"
                                      ? "默认图片模型"
                                      : "Default Image Model"}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{provider.provider_type}</td>
                        <td className="mono">{provider.base_url}</td>
                        <td className="mono">{provider.model}</td>
                        <td>
                          <span className="secret-mask">
                            •••• {provider.api_key_last4}
                          </span>
                          <small>{labels.keyStored}</small>
                        </td>
                        <td>
                          <span
                            className={`agent-state agent-state--${provider.enabled ? "active" : "paused"}`}
                          >
                            <i />
                            {provider.enabled ? labels.active : labels.paused}
                          </span>
                        </td>
                        <td>
                          <div className="agent-row-actions">
                            <IconButton
                              label={
                                testingConnections.includes(
                                  `provider:${provider.id}`,
                                )
                                  ? locale === "zh"
                                    ? "正在测试连接"
                                    : "Testing connection"
                                  : labels.test
                              }
                              aria-busy={testingConnections.includes(
                                `provider:${provider.id}`,
                              )}
                              disabled={testingConnections.includes(
                                `provider:${provider.id}`,
                              )}
                              onClick={() =>
                                void onTestConnection(
                                  "provider",
                                  provider.id,
                                  provider.name,
                                )
                              }
                              icon={
                                <RefreshCw
                                  className={
                                    testingConnections.includes(
                                      `provider:${provider.id}`,
                                    )
                                      ? "agent-row-actions__spinner"
                                      : undefined
                                  }
                                />
                              }
                            />
                            <IconButton
                              label={labels.edit}
                              icon={<Edit2 />}
                              onClick={() => onEditProvider(provider)}
                            />
                            <IconButton
                              variant="danger"
                              label={labels.delete}
                              icon={<Trash2 />}
                              onClick={() =>
                                onDeleteTarget({
                                  kind: "provider",
                                  value: provider,
                                })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspacePanel>
        </SudoGate>
      ) : null}

      {!editingAgent &&
      !editingProvider &&
      !editingEmbedding &&
      advancedSection === "connectors" ? (
        <ConnectorWorkspace locale={locale} onRefresh={onRefresh} />
      ) : null}

      {!editingAgent &&
      !editingProvider &&
      !editingEmbedding &&
      advancedSection === "knowledge" ? (
        <SudoGate
          title="知识库与向量模型保护"
          description="添加、编辑或删除 Embedding 知识库模型及全量重建索引需要近期多因素身份认证。解锁后享有 10 分钟无打扰编辑期。"
          actionLabel="解锁以管理知识库"
        >
          <WorkspacePanel className="agent-table-panel knowledge-workspace">
            <PanelHeader
              title={labels.knowledge}
              description={
                locale === "zh"
                  ? "仅索引已发布文章；Embedding 模型负责把文章转换为可检索的知识库。"
                  : "Published content only; jobs run asynchronously."
              }
              actions={
                <>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void onRetryIndex()}
                    icon={<RefreshCw />}
                  >
                    {locale === "zh" ? "重试失败任务" : "Retry failed"}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void onRebuildIndex()}
                    icon={<RefreshCw />}
                  >
                    {locale === "zh" ? "全量重建" : "Rebuild all"}
                  </Button>
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => onEditEmbedding("new")}
                    icon={<Plus />}
                  >
                    {locale === "zh"
                      ? "添加 Embedding 模型"
                      : "Add embedding profile"}
                  </Button>
                </>
              }
            />
            <div className="agent-run-metrics">
              <span>
                <small>{locale === "zh" ? "分段" : "Chunks"}</small>
                <strong>{indexStatus.chunks}</strong>
              </span>
              <span>
                <small>{locale === "zh" ? "队列" : "Queued"}</small>
                <strong>{indexStatus.queued}</strong>
              </span>
              <span>
                <small>{locale === "zh" ? "失败" : "Failed"}</small>
                <strong>{indexStatus.failed}</strong>
              </span>
            </div>
            <section className="knowledge-embedding-config">
              {embeddingProfiles.length === 0 ? (
                <EmptyState
                  label={
                    locale === "zh"
                      ? "还没有嵌入配置。"
                      : "No embedding profiles configured."
                  }
                />
              ) : (
                <div className="table-scroll">
                  <table className="content-table agent-table">
                    <thead>
                      <tr>
                        <th>{labels.providerName}</th>
                        <th>{labels.baseUrl}</th>
                        <th>{labels.model}</th>
                        <th>{locale === "zh" ? "向量维度" : "Dimensions"}</th>
                        <th>{labels.apiKey}</th>
                        <th>{labels.status}</th>
                        <th>{labels.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {embeddingProfiles.map((profile) => (
                        <tr key={profile.id}>
                          <td>
                            <div className="provider-identity">
                              <strong>{profile.name}</strong>
                            </div>
                          </td>
                          <td className="mono">{profile.base_url}</td>
                          <td className="mono">{profile.model}</td>
                          <td>{profile.dimensions}</td>
                          <td>
                            <span className="secret-mask">
                              •••• {profile.api_key_last4}
                            </span>
                            <small>{labels.keyStored}</small>
                          </td>
                          <td>
                            <span
                              className={`agent-state agent-state--${profile.enabled ? "active" : "paused"}`}
                            >
                              <i />
                              {profile.enabled ? labels.active : labels.paused}
                            </span>
                          </td>
                          <td>
                            <div className="agent-row-actions">
                              <IconButton
                                label={
                                  testingConnections.includes(
                                    `embedding:${profile.id}`,
                                  )
                                    ? locale === "zh"
                                      ? "正在测试连接"
                                      : "Testing connection"
                                    : labels.test
                                }
                                aria-busy={testingConnections.includes(
                                  `embedding:${profile.id}`,
                                )}
                                disabled={testingConnections.includes(
                                  `embedding:${profile.id}`,
                                )}
                                onClick={() =>
                                  void onTestConnection(
                                    "embedding",
                                    profile.id,
                                    profile.name,
                                  )
                                }
                                icon={
                                  <RefreshCw
                                    className={
                                      testingConnections.includes(
                                        `embedding:${profile.id}`,
                                      )
                                        ? "agent-row-actions__spinner"
                                        : undefined
                                    }
                                  />
                                }
                              />
                              <IconButton
                                label={labels.edit}
                                icon={<Edit2 />}
                                onClick={() => onEditEmbedding(profile)}
                              />
                              <IconButton
                                variant="danger"
                                label={labels.delete}
                                icon={<Trash2 />}
                                onClick={() =>
                                  onDeleteTarget({
                                    kind: "embedding",
                                    value: profile,
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </WorkspacePanel>
        </SudoGate>
      ) : null}
    </>
  );
}
