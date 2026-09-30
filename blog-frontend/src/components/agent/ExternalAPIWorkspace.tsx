import { Edit2, Plus, RotateCcw, ShieldOff } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { externalCapabilityApi } from "../../api/externalCapability";
import { useSudoMode } from "../../hooks/useSudoMode";
import type {
  ExternalAPIClient,
  ExternalAPIClientCreateInput,
  ExternalAPIClientUpdateInput,
  ExternalAPICreatedClient,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../../types/externalCapability";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Drawer,
  Empty,
  Field,
  FormLayout,
  Heading,
  IconButton,
  Input,
  Modal,
  Tag,
  Text,
} from "@gouno/ui/core";
import { SudoGate } from "../auth/SudoGate";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";

const EXTERNAL_CLIENT_FORM_ID = "ai-settings-external-client-editor";

type ExternalClientEditor = ExternalAPIClient | "new" | null;

interface ExternalClientFormValue {
  name: string;
  capabilities: string[];
  enabled: boolean;
  rateLimitPerMinute: number;
  expiresAt: string;
}

function requestError(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function dateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function expiresAtPayload(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function displayDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) return locale === "zh" ? "尚未调用" : "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function auditColor(result: ExternalInvocationAudit["result"]) {
  if (result === "success") return "success" as const;
  if (result === "denied" || result === "rate_limited")
    return "warning" as const;
  return "error" as const;
}

function ExternalAPIClientForm({
  initial,
  capabilities,
  locale,
  onSave,
}: {
  initial?: ExternalAPIClient;
  capabilities: ExternalCapability[];
  locale: "en" | "zh";
  onSave: (
    value: ExternalAPIClientCreateInput | ExternalAPIClientUpdateInput,
  ) => Promise<void>;
}) {
  const zh = locale === "zh";
  const [value, setValue] = useState<ExternalClientFormValue>(() => ({
    name: initial?.name || "",
    capabilities: [...(initial?.capabilities || [])],
    enabled: initial?.enabled ?? true,
    rateLimitPerMinute: initial?.rate_limit_per_minute ?? 60,
    expiresAt: dateTimeLocalValue(initial?.expires_at),
  }));
  const toggleCapability = (name: string, checked: boolean) => {
    setValue((current) => ({
      ...current,
      capabilities: checked
        ? [...new Set([...current.capabilities, name])].sort()
        : current.capabilities.filter((item) => item !== name),
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({
      name: value.name.trim(),
      capabilities: value.capabilities,
      enabled: value.enabled,
      rate_limit_per_minute: value.rateLimitPerMinute,
      expires_at: expiresAtPayload(value.expiresAt),
    });
  };

  return (
    <FormLayout id={EXTERNAL_CLIENT_FORM_ID} onSubmit={submit}>
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
                : "The name identifies the caller. The key prefix is audit metadata, not a usable credential."
            }
          >
            <div className="flex flex-col gap-5">
              <Field label={zh ? "Client 名称" : "Client name"} required>
                <Input
                  value={value.name}
                  onChange={(event) =>
                    setValue((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Editorial Reporting SDK"
                  required
                />
              </Field>
              {initial ? (
                <Field label={zh ? "Key 前缀" : "Key prefix"}>
                  <Input
                    readOnly
                    value={initial.key_prefix}
                    className="type-family-mono"
                  />
                </Field>
              ) : (
                <Text size="xs" tone="muted">
                  {zh
                    ? "保存后生成高熵 API Key；完整 Key 只显示一次，服务器仅持久化摘要。"
                    : "Saving generates a high-entropy API key. The full key is shown once and only its digest is persisted."}
                </Text>
              )}
              <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                <Checkbox
                  checked={value.enabled}
                  onChange={(event) =>
                    setValue((current) => ({
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
            title={zh ? "调用策略" : "Call policy"}
            description={
              zh
                ? "限流和到期时间属于 Client 策略；撤销后不能重新启用同一密钥。"
                : "Rate and expiry belong to the client policy. Revoked credentials cannot be restored."
            }
          >
            <div className="flex flex-col gap-5">
              <Field label={zh ? "每分钟请求上限" : "Requests per minute"}>
                <Input
                  type="number"
                  min={1}
                  max={6000}
                  value={String(value.rateLimitPerMinute)}
                  onChange={(event) =>
                    setValue((current) => ({
                      ...current,
                      rateLimitPerMinute: Math.max(
                        1,
                        Math.min(6000, Number(event.target.value) || 1),
                      ),
                    }))
                  }
                />
              </Field>
              <Field
                label={zh ? "到期时间" : "Expires at"}
                hint={
                  zh
                    ? "留空表示不自动到期；生产 Client 建议设置轮换周期。"
                    : "Leave empty for no automatic expiry. Production clients should use a rotation schedule."
                }
              >
                <Input
                  type="datetime-local"
                  value={value.expiresAt}
                  onChange={(event) =>
                    setValue((current) => ({
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
              : "v1 only grants explicitly selected read-only capabilities. Write and proposal tools are never listed here."
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <label
                key={capability.name}
                className="flex min-w-0 items-start gap-3 rounded-md border p-4"
              >
                <Checkbox
                  checked={value.capabilities.includes(capability.name)}
                  onChange={(event) =>
                    toggleCapability(capability.name, event.target.checked)
                  }
                />
                <span className="min-w-0 flex-1">
                  <strong className="block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                    {capability.name}
                  </strong>
                  <Text size="xs" tone="muted">
                    {zh
                      ? capability.description_zh || capability.description
                      : capability.description}
                  </Text>
                </span>
              </label>
            ))}
          </div>
        </AISettingsEditorSection>
      </div>
    </FormLayout>
  );
}

export function ExternalAPIWorkspace({ locale }: { locale: "en" | "zh" }) {
  const zh = locale === "zh";
  const [capabilities, setCapabilities] = useState<ExternalCapability[]>([]);
  const [clients, setClients] = useState<ExternalAPIClient[]>([]);
  const [audits, setAudits] = useState<ExternalInvocationAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ExternalClientEditor>(null);
  const [oneTimeKey, setOneTimeKey] =
    useState<ExternalAPICreatedClient | null>(null);
  const [revokeTarget, setRevokeTarget] =
    useState<ExternalAPIClient | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [capabilityData, clientData, auditData] = await Promise.all([
        externalCapabilityApi.listCapabilities(),
        externalCapabilityApi.listClients(),
        externalCapabilityApi.listAudits({ limit: 100 }),
      ]);
      setCapabilities(capabilityData || []);
      setClients(clientData || []);
      setAudits(auditData || []);
    } catch (reason) {
      setError(
        requestError(
          reason,
          zh
            ? "加载 External API 管理数据失败。"
            : "Failed to load External API management data.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveClient = async (
    value: ExternalAPIClientCreateInput | ExternalAPIClientUpdateInput,
  ) => {
    setError("");
    if (editing && editing !== "new") {
      await externalCapabilityApi.updateClient(
        editing.id,
        value as ExternalAPIClientUpdateInput,
      );
      setNotice(
        zh
          ? `${value.name} 的 Client 策略已保存。`
          : `${value.name} client policy saved.`,
      );
    } else {
      const created = await externalCapabilityApi.createClient(
        value as ExternalAPIClientCreateInput,
      );
      setOneTimeKey(created);
      setNotice(
        zh
          ? `${created.client.name} 已创建；请立即安全保存一次性 API Key。`
          : `${created.client.name} created. Save the one-time API key now.`,
      );
    }
    setEditing(null);
    await load();
  };

  const rotateClient = async (client: ExternalAPIClient) => {
    const key = `rotate:${client.id}`;
    setBusyAction(key);
    setError("");
    try {
      const created = await externalCapabilityApi.rotateClientKey(client.id);
      setOneTimeKey(created);
      setNotice(
        zh
          ? `${client.name} 的 API Key 已轮换；旧 Key 已立即失效。`
          : `${client.name} API key rotated; the previous key is now invalid.`,
      );
      await load();
    } catch (reason) {
      setError(
        requestError(
          reason,
          zh ? "轮换 API Key 失败。" : "Failed to rotate API key.",
        ),
      );
    } finally {
      setBusyAction("");
    }
  };

  const revokeClient = async () => {
    if (!revokeTarget) return;
    const client = revokeTarget;
    setBusyAction(`revoke:${client.id}`);
    setError("");
    try {
      await externalCapabilityApi.revokeClient(client.id);
      setNotice(
        zh
          ? `${client.name} 已撤销；当前 Key 不可恢复。`
          : `${client.name} revoked; the current key cannot be restored.`,
      );
      setRevokeTarget(null);
      await load();
    } catch (reason) {
      setError(
        requestError(
          reason,
          zh ? "撤销 API Client 失败。" : "Failed to revoke API client.",
        ),
      );
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div
      data-pattern="settings-composition"
      className="flex min-w-0 flex-col gap-5"
    >
      <TabPanelLead
        description={
          zh
            ? "把 Blog 的受控只读 Capability 提供给服务端调用方；Client 独立持有 scope、限流与到期策略。"
            : "Expose governed read-only Blog capabilities to server callers; each client owns its scopes, rate limit, and expiry."
        }
        actions={
          <Button
            size="small"
            variant="solid"
            color="primary"
            icon={<Plus />}
            disabled={loading}
            onClick={() => setEditing("new")}
          >
            {zh ? "创建 API Client" : "Create API client"}
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
              : "Long-lived API keys are server-only. Browsers do not use this channel, and v1 exposes only explicitly granted read-only capabilities."
          }
        />
        {error ? <Alert type="error" showIcon title={error} /> : null}
        {notice ? <Alert type="success" showIcon title={notice} /> : null}
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
                : "Callers first read the authorized capability catalog, then invoke by name. Long-lived keys belong only in the server Authorization header."}
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
                {zh ? "执行已授权 Capability" : "Invoke an authorized capability"}
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
              : "The endpoint does not offer browser CORS; browser requests carrying Origin are rejected. See OpenAPI for the complete request and response contract."}
          </Text>
        </div>
      </Card>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="external-clients-title"
      >
        <div>
          <Heading id="external-clients-title" level={2} variant="compact">
            API Clients
          </Heading>
          <Text size="sm" tone="muted">
            {zh
              ? "每个 Client 独立控制 Capability 白名单、限流和到期时间；Key 前缀用于审计定位，不是可用凭据。"
              : "Each client owns its capability allowlist, rate limit, and expiry. The key prefix is audit metadata, not a usable credential."}
          </Text>
        </div>
        {loading ? (
          <Card padding="base">
            <Text tone="muted">{zh ? "正在加载…" : "Loading…"}</Text>
          </Card>
        ) : clients.length === 0 ? (
          <Card padding="base">
            <Empty
              description={
                zh ? "尚未创建 API Client" : "No API clients have been created"
              }
            />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
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
                          ? `${zh ? "到期" : "Expires"}：${displayDateTime(
                              client.expires_at,
                              locale,
                            )}`
                          : zh
                            ? "不自动到期"
                            : "No automatic expiry"}{" "}
                        · {zh ? "最近调用" : "Last used"}：
                        {displayDateTime(client.last_used_at, locale)}
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
                        onClick={() => setEditing(client)}
                      />
                      <IconButton
                        label={
                          zh
                            ? `轮换 ${client.name} Key`
                            : `Rotate ${client.name} key`
                        }
                        icon={<RotateCcw />}
                        variant="ghost"
                        disabled={
                          revoked || busyAction === `rotate:${client.id}`
                        }
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
                        onClick={() => {
                          setNotice("");
                          setRevokeTarget(client);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="external-capabilities-title"
      >
        <div>
          <Heading id="external-capabilities-title" level={2} variant="compact">
            {zh ? "可授权 Capability" : "Grantable capabilities"}
          </Heading>
          <Text size="sm" tone="muted">
            {zh
              ? "目录来自同一个 Tool Registry，但只有 external surface 上的 read-only 能力可被 API Client 授权。"
              : "The catalog comes from the same Tool Registry, but only read-only capabilities on the external surface can be granted."}
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
                      ? capability.description_zh || capability.description
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
          <Heading id="external-audits-title" level={2} variant="compact">
            {zh ? "最近调用" : "Recent invocations"}
          </Heading>
          <Text size="sm" tone="muted">
            {zh
              ? "审计只记录 Capability、结果、耗时和输入摘要，不保存完整 API Key 或原始参数。"
              : "Audit records contain capability, outcome, duration, and an input digest, never the full API key or raw arguments."}
          </Text>
        </div>
        {audits.length === 0 ? (
          <Card padding="base">
            <Empty
              description={
                zh ? "尚无 External API 调用记录" : "No External API calls yet"
              }
            />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
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
                        {displayDateTime(audit.created_at, locale)}
                      </Text>
                    </div>
                    <Tag color={auditColor(audit.result)}>
                      {audit.result} · HTTP {audit.status_code}
                    </Tag>
                    <Text size="xs" tone="muted">
                      {audit.duration_ms} ms
                    </Text>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <Drawer
        open={editing !== null}
        title={
          editing === "new"
            ? zh
              ? "创建 API Client"
              : "Create API client"
            : zh
              ? `编辑 API Client：${editing?.name || ""}`
              : `Edit API client: ${editing?.name || ""}`
        }
        description={
          zh
            ? "为服务端调用方分配显式只读 Capability、限流和到期策略；API Key 仅在创建或轮换后显示一次。"
            : "Assign explicit read-only capabilities, rate limits, and expiry to a server caller. The API key is shown only after creation or rotation."
        }
        width={760}
        onClose={() => setEditing(null)}
        footer={
          editing ? (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditing(null)}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button
                form={EXTERNAL_CLIENT_FORM_ID}
                type="submit"
                variant="solid"
                color="primary"
              >
                {zh ? "保存 API Client" : "Save API client"}
              </Button>
            </>
          ) : null
        }
      >
        {editing ? (
          <div data-pattern="contextual-list-editor">
            <ExternalAPIClientForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? undefined : editing}
              capabilities={capabilities}
              locale={locale}
              onSave={saveClient}
            />
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(revokeTarget)}
        title={zh ? "确认撤销 API Client" : "Confirm API client revocation"}
        description={
          zh
            ? "撤销后该 Client 的当前 API Key 立即失效，且不能恢复；如需再次接入必须重新创建 Client。"
            : "Revocation invalidates the current API key immediately and cannot be undone. Reconnecting requires a new client."
        }
        onOpenChange={(open) => {
          if (!open && !busyAction.startsWith("revoke:")) {
            setRevokeTarget(null);
          }
        }}
        onOk={() => void revokeClient()}
        okText={zh ? "撤销并使 Key 失效" : "Revoke and invalidate key"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ variant: "solid", color: "error" }}
        confirmLoading={busyAction.startsWith("revoke:")}
        closeOnBackdrop
      >
        <Text>
          {zh
            ? `确定撤销「${revokeTarget?.name || ""}」吗？`
            : `Revoke “${revokeTarget?.name || ""}”?`}
        </Text>
      </Modal>

      <Modal
        open={Boolean(oneTimeKey)}
        title={zh ? "保存一次性 API Key" : "Save the one-time API key"}
        description={
          zh
            ? "完整 Key 只在创建或轮换后展示一次；关闭后无法再次查看，只能重新轮换。"
            : "The full key is shown only after creation or rotation. Once closed, it cannot be viewed again and must be rotated."
        }
        onOpenChange={(open) => {
          if (!open) setOneTimeKey(null);
        }}
        onOk={() => setOneTimeKey(null)}
        okText={zh ? "我已安全保存" : "I saved it securely"}
        cancelText={zh ? "关闭" : "Close"}
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-3">
          <Text>{oneTimeKey?.client.name || ""}</Text>
          <Input
            readOnly
            className="type-family-mono"
            value={oneTimeKey?.api_key || ""}
            aria-label={zh ? "一次性 API Key" : "One-time API key"}
          />
          <Alert
            type="warning"
            showIcon
            title={zh ? "不要放入浏览器代码" : "Do not put this in browser code"}
            description={
              zh
                ? "这个长期凭据只供服务端调用；服务器只保存其摘要，不保存明文。"
                : "This long-lived credential is server-only. The server persists only its digest, never the plaintext value."
            }
          />
        </div>
      </Modal>
    </div>
  );
}

export function ExternalAPIAccessWorkspaceGate({
  locale,
}: {
  locale: "en" | "zh";
}) {
  const { isSudoActive } = useSudoMode();

  return (
    <SudoGate
      locked={!isSudoActive}
      title={
        locale === "zh"
          ? "External API Client 与长期密钥保护"
          : "External API client and long-lived key protection"
      }
      description={
        locale === "zh"
          ? "创建、修改、轮换或撤销服务端 API Client 会改变外部访问权限，需要近期多因素身份认证。"
          : "Creating, changing, rotating, or revoking server API clients changes external access and requires recent MFA."
      }
      actionLabel={
        locale === "zh"
          ? "解锁以管理 API Access"
          : "Unlock API Access management"
      }
    >
      {isSudoActive ? <ExternalAPIWorkspace locale={locale} /> : null}
    </SudoGate>
  );
}
