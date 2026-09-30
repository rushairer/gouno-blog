import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit2, KeyRound, Plus, RotateCcw, ShieldOff } from "lucide-react";
import { externalCapabilityApi } from "../../api/external-capability";
import type {
  ExternalAPIClient,
  ExternalAPIClientPayload,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../../types/external-capability";
import { useSudoMode } from "../../hooks/useSudoMode";
import { SudoGate } from "../auth/SudoGate";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Drawer,
  Empty,
  Field,
  Heading,
  IconButton,
  Input,
  Modal,
  Tag,
  Text,
} from "@gouno/ui/core";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";

type Locale = "en" | "zh";

interface ClientDraft {
  name: string;
  enabled: boolean;
  rateLimitPerMinute: string;
  expiresAt: string;
  capabilities: string[];
}

function localDateTimeValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate(),
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function apiDateTimeValue(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid expiry time");
  }
  return parsed.toISOString();
}

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) return locale === "zh" ? "尚未调用" : "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function newDraft(): ClientDraft {
  return {
    name: "",
    enabled: true,
    rateLimitPerMinute: "60",
    expiresAt: "",
    capabilities: [],
  };
}

function draftFromClient(client: ExternalAPIClient): ClientDraft {
  return {
    name: client.name,
    enabled: client.enabled,
    rateLimitPerMinute: String(client.rate_limit_per_minute),
    expiresAt: localDateTimeValue(client.expires_at),
    capabilities: [...client.capabilities],
  };
}

function auditTone(result: ExternalInvocationAudit["result"]) {
  if (result === "success") return "success" as const;
  if (result === "denied" || result === "rate_limited")
    return "warning" as const;
  return "error" as const;
}

export function ExternalAPIWorkspace({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const { isSudoActive } = useSudoMode();
  const [clients, setClients] = useState<ExternalAPIClient[]>([]);
  const [capabilities, setCapabilities] = useState<ExternalCapability[]>([]);
  const [audits, setAudits] = useState<ExternalInvocationAudit[]>([]);
  const [editingClient, setEditingClient] = useState<
    ExternalAPIClient | "new" | null
  >(null);
  const [draft, setDraft] = useState<ClientDraft>(newDraft);
  const [oneTimeKey, setOneTimeKey] = useState<{
    clientName: string;
    apiKey: string;
  } | null>(null);
  const [revokeTarget, setRevokeTarget] =
    useState<ExternalAPIClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rotatingId, setRotatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientData, capabilityData, auditData] = await Promise.all([
        externalCapabilityApi.getClients(),
        externalCapabilityApi.getCapabilities(),
        externalCapabilityApi.getAudits({ limit: 100 }),
      ]);
      setClients(Array.isArray(clientData) ? clientData : []);
      setCapabilities(Array.isArray(capabilityData) ? capabilityData : []);
      setAudits(Array.isArray(auditData) ? auditData : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSudoActive) {
      setClients([]);
      setCapabilities([]);
      setAudits([]);
      setEditingClient(null);
      setOneTimeKey(null);
      setRevokeTarget(null);
      return;
    }
    void load();
  }, [isSudoActive, load]);

  const openEditor = (client: ExternalAPIClient | "new") => {
    setEditingClient(client);
    setDraft(client === "new" ? newDraft() : draftFromClient(client));
    setError("");
    setMessage("");
  };

  const closeEditor = () => {
    setEditingClient(null);
    setDraft(newDraft());
  };

  const toggleCapability = (name: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      capabilities: checked
        ? Array.from(new Set([...current.capabilities, name]))
        : current.capabilities.filter((capability) => capability !== name),
    }));
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingClient) return;
    const name = draft.name.trim();
    const rateLimit = Number(draft.rateLimitPerMinute);
    if (!name) {
      setError(zh ? "Client 名称不能为空。" : "Client name is required.");
      return;
    }
    if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 6000) {
      setError(
        zh
          ? "每分钟请求上限必须是 1–6000 之间的整数。"
          : "Rate limit must be an integer between 1 and 6000.",
      );
      return;
    }

    let expiresAt: string | null;
    try {
      expiresAt = apiDateTimeValue(draft.expiresAt);
    } catch {
      setError(zh ? "到期时间格式无效。" : "Expiry time is invalid.");
      return;
    }

    const payload: ExternalAPIClientPayload = {
      name,
      capabilities: [...draft.capabilities].sort(),
      enabled: draft.enabled,
      rate_limit_per_minute: rateLimit,
      expires_at: expiresAt,
    };

    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingClient === "new") {
        const created = await externalCapabilityApi.createClient(payload);
        setOneTimeKey({
          clientName: created.client.name,
          apiKey: created.api_key,
        });
        setMessage(
          zh
            ? `${created.client.name} 已创建；请立即安全保存一次性 API Key。`
            : `${created.client.name} created. Save the one-time API key now.`,
        );
      } else {
        await externalCapabilityApi.updateClient(editingClient.id, payload);
        setMessage(
          zh
            ? `${name} 的 Client 策略已更新。`
            : `${name} client policy updated.`,
        );
      }
      closeEditor();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const rotateClient = async (client: ExternalAPIClient) => {
    setRotatingId(client.id);
    setError("");
    setMessage("");
    try {
      const rotated = await externalCapabilityApi.rotateClientKey(client.id);
      setOneTimeKey({
        clientName: rotated.client.name,
        apiKey: rotated.api_key,
      });
      setMessage(
        zh
          ? `${client.name} 的 API Key 已轮换；旧 Key 已立即失效。`
          : `${client.name} API key rotated; the previous key is now invalid.`,
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setRotatingId(null);
    }
  };

  const revokeClient = async () => {
    if (!revokeTarget) return;
    const client = revokeTarget;
    setError("");
    setMessage("");
    try {
      await externalCapabilityApi.revokeClient(client.id);
      setRevokeTarget(null);
      setMessage(
        zh
          ? `${client.name} 已撤销；当前 Key 已失效且不可恢复。`
          : `${client.name} revoked. Its current key is invalid and cannot be restored.`,
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    }
  };

  return (
    <>
      <SudoGate
        title={
          zh
            ? "External API Client 与长期密钥保护"
            : "External API client and long-lived credential protection"
        }
        description={
          zh
            ? "创建、修改、轮换或撤销服务端 API Client 会改变外部访问权限，需要近期多因素身份认证。"
            : "Creating, editing, rotating, or revoking server API clients changes external access and requires recent MFA."
        }
        actionLabel={zh ? "解锁以管理 API Access" : "Unlock API Access"}
      >
        {isSudoActive ? (
          <div className="flex min-w-0 flex-col gap-5">
            <TabPanelLead
              description={
                zh
                  ? "把 Blog 的受控只读 Capability 提供给服务端调用方；Client 独立持有 scope、限流与到期策略。"
                  : "Expose governed read-only Blog capabilities to server callers. Each client owns its scopes, rate limit, and expiry policy."
              }
              actions={
                <Button
                  size="small"
                  variant="solid"
                  color="primary"
                  icon={<Plus />}
                  type="button"
                  onClick={() => openEditor("new")}
                >
                  {zh ? "创建 API Client" : "Create API Client"}
                </Button>
              }
            />

            <TabPanelFeedback>
              <Alert
                type="info"
                showIcon
                title={
                  zh
                    ? "Server-to-server API 边界"
                    : "Server-to-server API boundary"
                }
                description={
                  zh
                    ? "长期 API Key 只供服务端调用；浏览器请求不会使用这条通道。v1 仅开放显式授权的 read-only Capability。"
                    : "Long-lived API keys are server-only. Browser requests do not use this channel, and v1 exposes only explicitly authorized read-only capabilities."
                }
              />
              {error ? (
                <Alert type="error" showIcon>
                  {error}
                </Alert>
              ) : null}
              {message ? (
                <Alert type="success" showIcon role="status">
                  {message}
                </Alert>
              ) : null}
            </TabPanelFeedback>

            <Card padding="base">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Heading level={2} variant="compact">
                      {zh ? "调用协议" : "Invocation protocol"}
                    </Heading>
                    <Tag color="success">server-to-server</Tag>
                  </div>
                  <Text size="sm" tone="muted">
                    {zh
                      ? "调用方先读取已授权 Capability 目录，再按名称执行；长期 API Key 只放在服务端 Authorization Header 中。"
                      : "Callers first read their authorized capability catalog, then invoke by name. The long-lived API key stays only in a server Authorization header."}
                  </Text>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <Text size="xs" tone="muted">
                      {zh ? "Capability 目录" : "Capability catalog"}
                    </Text>
                    <strong className="mt-1 block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                      GET /api/external/v1/capabilities
                    </strong>
                  </div>
                  <div className="rounded-md border p-4">
                    <Text size="xs" tone="muted">
                      {zh
                        ? "执行已授权 Capability"
                        : "Invoke an authorized capability"}
                    </Text>
                    <strong className="mt-1 block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                      {"POST /api/external/v1/capabilities/{name}/invoke"}
                    </strong>
                  </div>
                </div>
                <Text
                  size="xs"
                  tone="muted"
                  className="type-family-mono [overflow-wrap:anywhere]"
                >
                  Authorization: Bearer gouno_live_…
                </Text>
                <Text size="xs" tone="muted">
                  {zh
                    ? "该入口不提供浏览器 CORS；带 Origin 的浏览器请求会被拒绝。完整请求/响应结构以 OpenAPI 契约为准。"
                    : "This endpoint does not expose browser CORS; browser requests carrying Origin are rejected. Use the OpenAPI contract for full request and response shapes."}
                </Text>
              </div>
            </Card>

            <section
              className="flex flex-col gap-3"
              aria-labelledby="external-clients-title"
            >
              <div>
                <Heading
                  id="external-clients-title"
                  level={2}
                  variant="compact"
                >
                  API Clients
                </Heading>
                <Text size="sm" tone="muted">
                  {zh
                    ? "每个 Client 独立控制 Capability 白名单、限流和到期时间；Key 前缀用于审计定位，不是可用凭据。"
                    : "Each client controls its capability allowlist, rate limit, and expiry. The key prefix is an audit identifier, not a usable credential."}
                </Text>
              </div>
              <Card padding="none" className="overflow-hidden">
                {loading && clients.length === 0 ? (
                  <CardContent className="p-6">
                    <Text size="sm" tone="muted">
                      {zh ? "正在加载 API Clients…" : "Loading API clients…"}
                    </Text>
                  </CardContent>
                ) : clients.length === 0 ? (
                  <CardContent className="p-6">
                    <Empty
                      icon={<KeyRound />}
                      title={
                        zh ? "还没有 API Client" : "No API clients yet"
                      }
                      description={
                        zh
                          ? "创建 Client 后再分配显式只读 Capability。"
                          : "Create a client, then assign explicit read-only capabilities."
                      }
                    />
                  </CardContent>
                ) : (
                  <CardContent className="divide-y p-0">
                    {clients.map((client) => {
                      const revoked = Boolean(client.revoked_at);
                      return (
                        <div
                          key={client.id}
                          className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between"
                        >
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong>{client.name}</strong>
                              <Tag
                                color={
                                  revoked
                                    ? "error"
                                    : client.enabled
                                      ? "success"
                                      : "default"
                                }
                              >
                                {revoked
                                  ? zh
                                    ? "已撤销"
                                    : "Revoked"
                                  : client.enabled
                                    ? zh
                                      ? "已启用"
                                      : "Enabled"
                                    : zh
                                      ? "已停用"
                                      : "Disabled"}
                              </Tag>
                              <Tag>{client.rate_limit_per_minute}/min</Tag>
                            </div>
                            <Text
                              size="xs"
                              tone="muted"
                              className="type-family-mono"
                            >
                              {client.key_prefix}••••
                            </Text>
                            <div className="flex flex-wrap gap-2">
                              {client.capabilities.map((capability) => (
                                <Tag key={capability}>{capability}</Tag>
                              ))}
                            </div>
                            <Text size="xs" tone="muted">
                              {client.expires_at
                                ? `${zh ? "到期" : "Expires"}：${formatDateTime(
                                    client.expires_at,
                                    locale,
                                  )}`
                                : zh
                                  ? "不自动到期"
                                  : "No automatic expiry"}{" "}
                              · {zh ? "最近调用" : "Last used"}：
                              {formatDateTime(client.last_used_at, locale)}
                            </Text>
                          </div>
                          <div className="flex min-w-max flex-nowrap items-center gap-1">
                            <IconButton
                              label={
                                zh
                                  ? `编辑 ${client.name}`
                                  : `Edit ${client.name}`
                              }
                              icon={<Edit2 />}
                              variant="ghost"
                              disabled={revoked}
                              onClick={() => openEditor(client)}
                            />
                            <IconButton
                              label={
                                zh
                                  ? `轮换 ${client.name} Key`
                                  : `Rotate ${client.name} key`
                              }
                              icon={<RotateCcw />}
                              variant="ghost"
                              disabled={revoked || rotatingId === client.id}
                              onClick={() => void rotateClient(client)}
                            />
                            <IconButton
                              label={
                                zh
                                  ? `撤销 ${client.name}`
                                  : `Revoke ${client.name}`
                              }
                              icon={<ShieldOff />}
                              variant="ghost"
                              color="error"
                              disabled={revoked}
                              onClick={() => setRevokeTarget(client)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            </section>

            <section
              className="flex flex-col gap-3"
              aria-labelledby="external-capabilities-title"
            >
              <div>
                <Heading
                  id="external-capabilities-title"
                  level={2}
                  variant="compact"
                >
                  {zh ? "可授权 Capability" : "Grantable capabilities"}
                </Heading>
                <Text size="sm" tone="muted">
                  {zh
                    ? "目录来自同一个 Tool Registry，但只有 external surface 上的 read-only 能力可被 API Client 授权。"
                    : "The catalog comes from the same Tool Registry, but only read-only capabilities on the external surface can be granted to API clients."}
                </Text>
              </div>
              <Card padding="none" className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {capabilities.map((capability) => (
                    <div
                      key={capability.name}
                      className="grid gap-2 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <strong className="type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                          {capability.name}
                        </strong>
                        <Text size="xs" tone="muted">
                          {zh
                            ? capability.description_zh ||
                              capability.description
                            : capability.description}
                        </Text>
                      </div>
                      <Tag color="success">read-only</Tag>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section
              className="flex flex-col gap-3"
              aria-labelledby="external-audits-title"
            >
              <div>
                <Heading
                  id="external-audits-title"
                  level={2}
                  variant="compact"
                >
                  {zh ? "最近调用" : "Recent invocations"}
                </Heading>
                <Text size="sm" tone="muted">
                  {zh
                    ? "审计只记录 Capability、结果、耗时和输入摘要，不保存完整 API Key 或原始参数。"
                    : "Audit records contain capability, result, latency, and an input digest; they do not store full API keys or raw arguments."}
                </Text>
              </div>
              <Card padding="none" className="overflow-hidden">
                {audits.length === 0 ? (
                  <CardContent className="p-6">
                    <Empty
                      title={zh ? "暂无调用记录" : "No invocation records"}
                      description={
                        zh
                          ? "API Client 首次调用后会在这里出现审计证据。"
                          : "Invocation evidence appears here after a client makes its first call."
                      }
                    />
                  </CardContent>
                ) : (
                  <CardContent className="divide-y p-0">
                    {audits.map((audit) => {
                      const client = clientMap.get(audit.client_id);
                      return (
                        <div
                          key={audit.id}
                          className="grid gap-3 p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <strong className="type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                              {audit.capability}
                            </strong>
                            <Text size="xs" tone="muted">
                              {client?.name || `Client #${audit.client_id}`} ·{" "}
                              {formatDateTime(audit.created_at, locale)}
                            </Text>
                          </div>
                          <Tag color={auditTone(audit.result)}>
                            {audit.result} · HTTP {audit.status_code}
                          </Tag>
                          <Text size="xs" tone="muted">
                            {audit.duration_ms} ms
                          </Text>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            </section>
          </div>
        ) : null}
      </SudoGate>

      <Drawer
        open={editingClient !== null}
        width={720}
        title={
          editingClient === "new"
            ? zh
              ? "创建 API Client"
              : "Create API Client"
            : zh
              ? `编辑 API Client：${editingClient?.name || ""}`
              : `Edit API Client: ${editingClient?.name || ""}`
        }
        description={
          zh
            ? "为服务端调用方分配显式只读 Capability、限流和到期策略；API Key 仅在创建或轮换后显示一次。"
            : "Assign explicit read-only capabilities, rate limits, and expiry to a server caller. The API key is shown only after create or rotate."
        }
        onClose={closeEditor}
        footer={
          editingClient ? (
            <>
              <Button variant="outline" type="button" onClick={closeEditor}>
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button
                form="ai-settings-external-client-editor"
                type="submit"
                variant="solid"
                color="primary"
                loading={saving}
              >
                {zh ? "保存 API Client" : "Save API Client"}
              </Button>
            </>
          ) : null
        }
      >
        {editingClient ? (
          <form id="ai-settings-external-client-editor" onSubmit={submitClient}>
            <div
              data-pattern="editor-form-composition"
              className="flex flex-col gap-5"
            >
              <div className="grid gap-5 xl:grid-cols-2">
                <AISettingsEditorSection
                  title={zh ? "Client 身份" : "Client identity"}
                  description={
                    zh
                      ? "名称用于识别调用方；Key 前缀只用于审计定位，不是可用凭据。"
                      : "The name identifies the caller. The key prefix is only for audit lookup and is not a usable credential."
                  }
                >
                  <div className="flex flex-col gap-5">
                    <Field
                      label={zh ? "Client 名称" : "Client name"}
                      required
                    >
                      <Input
                        value={draft.name}
                        placeholder="Editorial Reporting SDK"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    {editingClient !== "new" ? (
                      <Field label={zh ? "Key 前缀" : "Key prefix"}>
                        <Input
                          value={editingClient.key_prefix}
                          readOnly
                          className="type-family-mono"
                        />
                      </Field>
                    ) : (
                      <Text size="xs" tone="muted">
                        {zh
                          ? "保存后生成高熵 API Key；完整 Key 只显示一次，服务端仅保存哈希。"
                          : "Saving generates a high-entropy API key. The full key is shown once; the server stores only its hash."}
                      </Text>
                    )}
                    <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                      <Checkbox
                        checked={draft.enabled}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      {zh ? "启用 Client" : "Enable client"}
                    </label>
                  </div>
                </AISettingsEditorSection>

                <AISettingsEditorSection
                  title={zh ? "调用策略" : "Invocation policy"}
                  description={
                    zh
                      ? "限流和到期时间属于 Client 策略；撤销后不能重新启用同一密钥。"
                      : "Rate limits and expiry belong to the client policy. Revoked keys cannot be re-enabled."
                  }
                >
                  <div className="flex flex-col gap-5">
                    <Field
                      label={
                        zh ? "每分钟请求上限" : "Requests per minute"
                      }
                    >
                      <Input
                        type="number"
                        min={1}
                        max={6000}
                        value={draft.rateLimitPerMinute}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rateLimitPerMinute: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={zh ? "到期时间" : "Expires at"}
                      hint={
                        zh
                          ? "留空表示不自动到期；生产环境建议设置轮换周期。"
                          : "Leave empty for no automatic expiry. Production clients should use a rotation schedule."
                      }
                    >
                      <Input
                        type="datetime-local"
                        value={draft.expiresAt}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            expiresAt: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                </AISettingsEditorSection>
              </div>

              <AISettingsEditorSection
                title={zh ? "Capability 白名单" : "Capability allowlist"}
                description={
                  zh
                    ? "v1 只允许显式授权的 read-only Capability；写入和提案能力不会出现在这里。"
                    : "v1 permits only explicitly granted read-only capabilities. Write and proposal tools do not appear here."
                }
              >
                {capabilities.length === 0 ? (
                  <Empty
                    description={
                      zh
                        ? "当前没有可对外授权的 read-only Capability。"
                        : "No read-only external capabilities are currently grantable."
                    }
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {capabilities.map((capability) => (
                      <label
                        key={capability.name}
                        className="flex min-w-0 items-start gap-3 rounded-md border p-4"
                      >
                        <Checkbox
                          checked={draft.capabilities.includes(
                            capability.name,
                          )}
                          onChange={(event) =>
                            toggleCapability(
                              capability.name,
                              event.target.checked,
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                            {capability.name}
                          </strong>
                          <Text size="xs" tone="muted">
                            {zh
                              ? capability.description_zh ||
                                capability.description
                              : capability.description}
                          </Text>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </AISettingsEditorSection>
            </div>
          </form>
        ) : null}
      </Drawer>

      <Modal
        open={revokeTarget !== null}
        title={zh ? "确认撤销 API Client" : "Confirm API client revocation"}
        description={
          zh
            ? "撤销后该 Client 的当前 API Key 立即失效，且不能恢复；如需再次接入必须重新创建 Client。"
            : "Revocation invalidates the current API key immediately and cannot be undone. A new client is required to reconnect later."
        }
        onClose={() => setRevokeTarget(null)}
        onOk={() => void revokeClient()}
        okText={zh ? "撤销并使 Key 失效" : "Revoke and invalidate key"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text>
          {zh
            ? `确定撤销「${revokeTarget?.name || ""}」吗？`
            : `Revoke “${revokeTarget?.name || ""}”?`}
        </Text>
      </Modal>

      <Modal
        open={oneTimeKey !== null}
        title={zh ? "保存一次性 API Key" : "Save one-time API key"}
        description={
          zh
            ? "完整 Key 只在创建或轮换后展示一次；关闭后无法再次查看，只能重新轮换。"
            : "The full key is shown only after create or rotate. After closing this dialog it cannot be viewed again and must be rotated instead."
        }
        onClose={() => setOneTimeKey(null)}
        onOk={() => setOneTimeKey(null)}
        okText={zh ? "我已安全保存" : "I saved it securely"}
        cancelText={zh ? "关闭" : "Close"}
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-3">
          <Text>{oneTimeKey?.clientName}</Text>
          <Input
            readOnly
            className="type-family-mono"
            value={oneTimeKey?.apiKey || ""}
            aria-label={zh ? "一次性 API Key" : "One-time API key"}
          />
          <Alert
            type="warning"
            showIcon
            title={zh ? "不要放入浏览器代码" : "Do not put this in browser code"}
            description={
              zh
                ? "这个长期凭据只供服务端调用；后端只保存其哈希，不保存明文。"
                : "This long-lived credential is for server use only. The backend stores only its hash, not the plaintext key."
            }
          />
        </div>
      </Modal>
    </>
  );
}
