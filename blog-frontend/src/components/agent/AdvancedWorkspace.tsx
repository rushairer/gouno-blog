import { useRef, type ReactNode } from "react";
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
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  IconButton,
  Select,
  Tabs,
  Tag,
  Text,
} from "@gouno/ui/core";

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

function TabPanelLead({
  description,
  actions,
}: {
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!description && !actions) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {description ? (
          <Text tone="muted" size="sm" className="max-w-3xl leading-relaxed">
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
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
      <Tabs<AdvancedSection>
        ariaLabel={labels.advanced}
        activeKey={advancedSection}
        onChange={onSelectSection}
        items={[
          {
            key: "agents",
            label: labels.agents,
            icon: <Bot aria-hidden="true" className="size-4" />,
          },
          {
            key: "skills",
            label: labels.skills,
            icon: <ListChecks aria-hidden="true" className="size-4" />,
          },
          {
            key: "tools",
            label: "Tools",
            icon: <GitBranch aria-hidden="true" className="size-4" />,
          },
          {
            key: "knowledge",
            label: labels.knowledge,
            icon: <DatabaseZap aria-hidden="true" className="size-4" />,
          },
          {
            key: "providers",
            label: labels.providers,
            icon: <KeyRound aria-hidden="true" className="size-4" />,
          },
          {
            key: "connectors",
            label: locale === "zh" ? "Sandbox 连接器" : "Sandbox connectors",
            icon: <LockKeyhole aria-hidden="true" className="size-4" />,
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
        <div className="flex flex-col gap-5">
          <TabPanelLead
            description={
              locale === "zh"
                ? "由代码发布的受控能力目录；Workflow 不直接调用 Tool，必须经过 Skill/Agent 授权。"
                : "Code-published governed capabilities; Workflows do not invoke Tools directly and must use Skill/Agent authorization."
            }
          />
          {tools.length === 0 ? (
            <Card padding="base">
              <Empty description={locale === "zh" ? "暂无 Tool" : "No Tools"} />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <CardContent className="divide-y p-0">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="grid gap-3 p-6 md:grid-cols-[minmax(0,1fr)_minmax(8rem,0.3fr)_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <strong className="font-mono text-sm">{tool.name}</strong>
                      <Text size="xs" tone="muted">
                        {locale === "zh"
                          ? tool.description_zh || tool.description
                          : tool.description}
                      </Text>
                    </div>
                    <Text size="sm">
                      {tool.surfaces?.join(", ") || "agent"}
                    </Text>
                    <RiskPill risk={tool.risk_level} locale={locale} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {!editingAgent && !editingProvider && advancedSection === "agents" ? (
        <div className="flex flex-col gap-5">
          <TabPanelLead
            description={
              locale === "zh"
                ? "Skill Version + 模型连接 + 运行计划组成可审计的执行单元。"
                : "A Skill Version, model connection, and run schedule form an auditable execution unit."
            }
            actions={
              <Button
                size="small"
                variant="solid"
                color="primary"
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
          {providers.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              title={
                locale === "zh"
                  ? "先添加模型连接"
                  : "Add a model connection first"
              }
              description={
                locale === "zh"
                  ? "保存首个可用模型连接后再创建 Agent。"
                  : "Save the first usable model connection before creating an Agent."
              }
              action={
                <Button
                  size="small"
                  type="button"
                  onClick={() => onSelectSection("providers")}
                >
                  {locale === "zh"
                    ? "配置模型连接"
                    : "Configure a model connection"}
                </Button>
              }
            />
          ) : null}
          {agents.length === 0 ? (
            <Card padding="lg">
              <Empty
                title={locale === "zh" ? "暂无 Agent" : "No Agents yet"}
                description={
                  locale === "zh"
                    ? "创建 Agent 后可配置模型、Skill、调度、配额和启停状态。"
                    : "Create an Agent to configure its model, Skill, schedule, quotas, and state."
                }
              />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <CardContent className="divide-y p-0">
                {agents.map((agent) => {
                  const defaultWritingProvider = providers.find(
                    (provider) =>
                      provider.enabled && provider.is_default_writing,
                  );
                  const provider = agent.provider_profile_id
                    ? providerMap.get(agent.provider_profile_id)
                    : defaultWritingProvider;
                  const latestRun = runs.find(
                    (run) => run.agent_id === agent.id,
                  );
                  const toolsForSkill = agent.skill?.capabilities || [];
                  return (
                    <div
                      key={agent.id}
                      className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between"
                    >
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{agent.name}</strong>
                          <Tag color={agent.enabled ? "success" : "default"}>
                            {agent.enabled ? labels.active : labels.paused}
                          </Tag>
                          {agent.system_key ? (
                            <Tag color="primary">
                              {locale === "zh"
                                ? "默认能力"
                                : "Default capability"}
                            </Tag>
                          ) : (
                            <Tag>{locale === "zh" ? "自定义" : "Custom"}</Tag>
                          )}
                        </div>
                        <Text size="sm" tone="muted">
                          {agent.description}
                        </Text>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <span>
                            {labels.provider}:{" "}
                            {provider?.name ||
                              (locale === "zh"
                                ? "跟随系统默认"
                                : "Inherit Default")}
                          </span>
                          <span>
                            Skill: {agent.skill?.name || "—"} v
                            {agent.skill?.version || "—"} ·{" "}
                            {toolsForSkill.length} Tools
                          </span>
                          <span>
                            {agent.trigger_type === "cron"
                              ? agent.cron_expression
                              : labels.manual}
                            {agent.trigger_type === "cron" && agent.timezone
                              ? ` · ${agent.timezone}`
                              : ""}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            {latestRun ? (
                              <>
                                <StatusPill
                                  status={latestRun.status}
                                  locale={locale}
                                />
                                <span>
                                  {formatDateTime(latestRun.created_at)}
                                </span>
                              </>
                            ) : (
                              labels.never
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {toolsForSkill.map((capability) => (
                            <Tag key={capability}>
                              {formatCapability(capability)}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <div className="flex min-w-max shrink-0 flex-nowrap items-center gap-1">
                        <IconButton
                          label={labels.runNow}
                          icon={<Play />}
                          variant="ghost"
                          onClick={() => void onRunAgent(agent)}
                          disabled={!agent.enabled}
                        />
                        <IconButton
                          label={labels.edit}
                          icon={<Edit2 />}
                          variant="ghost"
                          onClick={() => onEditAgent(agent)}
                        />
                        <Button
                          size="small"
                          variant="ghost"
                          icon={agent.enabled ? <CirclePause /> : <Play />}
                          onClick={() => void onToggleAgentEnabled(agent)}
                        >
                          {agent.enabled ? labels.disable : labels.enable}
                        </Button>
                        {!agent.system_key ? (
                          <IconButton
                            variant="ghost"
                            color="error"
                            label={labels.delete}
                            icon={<Trash2 />}
                            onClick={() =>
                              onDeleteTarget({ kind: "agent", value: agent })
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {!editingAgent &&
      !editingProvider &&
      !editingSkill &&
      advancedSection === "skills" ? (
        <div className="flex flex-col gap-5">
          <input
            ref={skillFileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void onImportSkill(event)}
          />
          <TabPanelLead
            description={
              locale === "zh"
                ? "管理可复用、可版本化的 AI 能力定义；系统 Skill 与团队副本保持清晰边界。"
                : "Manage reusable, versioned AI capability definitions while keeping system Skills and team copies distinct."
            }
            actions={
              <>
                <Button
                  size="small"
                  variant="outline"
                  type="button"
                  onClick={() => skillFileInputRef.current?.click()}
                  icon={<Upload />}
                >
                  {locale === "zh" ? "导入 Skill" : "Import Skill"}
                </Button>
                <Button
                  size="small"
                  variant="solid"
                  color="primary"
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
            <Card padding="base">
              <Empty description={labels.noSkills} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {skills.map((skill) => (
                <Card key={skill.id} padding="base">
                  <div className="flex h-full flex-col gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{skill.name}</strong>
                        <Tag color={skill.system_key ? "primary" : "default"}>
                          {skill.system_key
                            ? locale === "zh"
                              ? "系统 Skill"
                              : "System Skill"
                            : locale === "zh"
                              ? "自定义"
                              : "Custom"}
                        </Tag>
                        <Tag
                          color={
                            skill.execution_mode === "approval"
                              ? "warning"
                              : "default"
                          }
                        >
                          {skill.execution_mode === "approval"
                            ? labels.approvalMode
                            : labels.advisory}
                        </Tag>
                      </div>
                      <Text size="xs" tone="muted">
                        v{skill.version} · {formatDateTime(skill.updated_at)}
                      </Text>
                    </div>
                    <Text size="sm" tone="muted">
                      {skill.description}
                    </Text>
                    <div className="flex flex-wrap gap-2">
                      {skill.capabilities.map((capability) => (
                        <Tag key={capability}>
                          {formatCapability(capability)}
                        </Tag>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                      <Button
                        size="small"
                        variant="ghost"
                        icon={<Download />}
                        onClick={() => void onExportSkill(skill)}
                      >
                        {locale === "zh" ? "导出" : "Export Skill"}
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        icon={<Copy />}
                        onClick={() => void onCopySkill(skill)}
                      >
                        {locale === "zh" ? "复制" : "Copy Skill"}
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        icon={<Edit2 />}
                        onClick={() => onEditSkill(skill)}
                      >
                        {labels.edit}
                      </Button>
                      {!skill.system_key ? (
                        <Button
                          size="small"
                          variant="ghost"
                          color="error"
                          icon={<Trash2 />}
                          onClick={() =>
                            onDeleteTarget({ kind: "skill", value: skill })
                          }
                        >
                          {labels.delete}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!editingAgent && !editingProvider && advancedSection === "providers" ? (
        <SudoGate
          title="模型连接与密钥保护"
          description="添加、修改、导出或删除 AI 模型连接涉及敏感 API Key 凭据。解锁后享有 10 分钟无打扰编辑期。"
          actionLabel="解锁以管理模型连接"
        >
          <Card className="agent-table-panel">
            <input
              ref={providerFileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void onImportProviders(event)}
            />
            <CardHeader
              title={labels.providers}
              description={
                locale === "zh"
                  ? "管理模型连接，并分别指定文本模型与图片生成的默认模型。"
                  : "Manage model connections and defaults."
              }
              action={
                <>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void onExportProviders()}
                    icon={<Download />}
                  >
                    {labels.exportProviders}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => providerFileInputRef.current?.click()}
                    icon={<Upload />}
                  >
                    {labels.importProviders}
                  </Button>
                  <Button
                    variant="solid"
                    color="primary"
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
                    value={String(
                      providers.find((item) => item.is_default_writing)?.id ||
                        "",
                    )}
                    onChange={(value) => {
                      const id = value ? Number(value) : 0;
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
                        <option key={item.id} value={String(item.id)}>
                          {item.name} · {item.model}
                        </option>
                      ))}
                  </Select>
                </label>
                <label>
                  {locale === "zh" ? "图片生成" : "Image Generation"}
                  <Select
                    value={String(
                      providers.find((item) => item.is_default_image)?.id || "",
                    )}
                    onChange={(value) => {
                      const id = value ? Number(value) : 0;
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
                        <option key={item.id} value={String(item.id)}>
                          {item.name} · {item.model}
                        </option>
                      ))}
                  </Select>
                </label>
              </section>
            ) : null}
            {providers.length === 0 ? (
              <Empty description={labels.noProviders} />
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
                              variant="ghost"
                              color="error"
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
          </Card>
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
          <Card className="agent-table-panel knowledge-workspace">
            <CardHeader
              title={labels.knowledge}
              description={
                locale === "zh"
                  ? "仅索引已发布文章；Embedding 模型负责把文章转换为可检索的知识库。"
                  : "Published content only; jobs run asynchronously."
              }
              action={
                <>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void onRetryIndex()}
                    icon={<RefreshCw />}
                  >
                    {locale === "zh" ? "重试失败任务" : "Retry failed"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void onRebuildIndex()}
                    icon={<RefreshCw />}
                  >
                    {locale === "zh" ? "全量重建" : "Rebuild all"}
                  </Button>
                  <Button
                    variant="solid"
                    color="primary"
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
                <Empty
                  description={
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
                                variant="ghost"
                                color="error"
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
          </Card>
        </SudoGate>
      ) : null}
    </>
  );
}
