import { Edit2, Plus, RotateCcw, ShieldOff } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { externalCapabilityApi } from "../../api/externalCapability";
import { useSudoMode } from "../../hooks/useSudoMode";
import type {
  ExternalAPICreatedClient,
  ExternalAPIClient,
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
  Skeleton,
  Switch,
  Tag,
  Text,
} from "@gouno/ui/core";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";

type Locale = "en" | "zh";

type EditorState = ExternalAPIClient | "new" | null;

function localDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function auditTone(result: ExternalInvocationAudit["result"]) {
  if (result === "success") return "success" as const;
  if (result === "denied" || result === "rate_limited")
    return "warning" as const;
  return "error" as const;
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : "Request failed";
}

export function ExternalAPIWorkspace({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const { isSudoActive } = useSudoMode();
  const [capabilities, setCapabilities] = useState<ExternalCapability[]>([]);
  const [clients, setClients] = useState<ExternalAPIClient[]>([]);
  const [audits, setAudits] = useState<ExternalInvocationAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<EditorState>(null);
  const [oneTimeKey, setOneTimeKey] = useState<ExternalAPICreatedClient | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] = useState<ExternalAPIClient | null>(
    null,
  );

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
    [],
  );

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const load = useCallback(async () => {
    if (!isSudoActive) return;
    setLoading(true);
    setError("");
    try {
      const [capabilityData, clientData, auditData] = await Promise.all([
        externalCapabilityApi.getCapabilities(),
        externalCapabilityApi.getClients(),
        externalCapabilityApi.getAudits({ limit: 100 }),
      ]);
      setCapabilities(Array.isArray(capabilityData) ? capabilityData : []);
      setClients(Array.isArray(clientData) ? clientData : []);
      setAudits(Array.isArray(auditData) ? auditData : []);
      setLoaded(true);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, [isSudoActive]);

  useEffect(() => {
    if (!isSudoActive) {
      setCapabilities([]);
      setClients([]);
      setAudits([]);
      setLoaded(false);
      setEditing(null);
      setOneTimeKey(null);
      setRevokeTarget(null);
      return;
    }
    void load();
  }, [isSudoActive, load]);

  const openEditor = (value: ExternalAPIClient | "new") => {
    setEditing(value);
    setError("");
    setMessage("");
    if (value === "new") {
      setName("");
      setEnabled(true);
      setRateLimit(60);
      setExpiresAt("");
      setSelectedCapabilities([]);
      return;
    }
    setName(value.name);
    setEnabled(value.enabled);
    setRateLimit(value.rate_limit_per_minute);
    setExpiresAt(localDateTimeValue(value.expires_at));
    setSelectedCapabilities([...value.capabilities]);
  };

  const closeEditor = () => setEditing(null);

  const toggleCapability = (capability: string, checked: boolean) => {
    setSelectedCapabilities((current) =>
      checked
        ? current.includes(capability)
          ? current
          : [...current, capability]
        : current.filter((item) => item !== capability),
    );
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setError("");
    setMessage("");
    try {
      const payload = {
        name: name.trim(),
        capabilities: selectedCapabilities,
        enabled,
        rate_limit_per_minute: rateLimit,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (editing === "new") {
        const created = await externalCapabilityApi.createClient(payload);
        setOneTimeKey(created);
        setMessage(
          zh
            ? `${created.client.name} 已创建；请立即安全保存一次性 API Key。`
            : `${created.client.name} created. Save the one-time API key now.`,
        );
      } else {
        await externalCapabilityApi.updateClient(editing.id, payload);
        setMessage(zh ? `${name} 已更新。` : `${name} updated.`);
      }
      closeEditor();
      await load();
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const rotateClient = async (client: ExternalAPIClient) => {
    setError("");
    setMessage("");
    try {
      const created = await externalCapabilityApi.rotateClientKey(client.id);
      setOneTimeKey(created);
      setMessage(
        zh
          ? `${client.name} 的 API Key 已轮换；旧 Key 已立即失效。`
          : `${client.name} API key rotated; the previous key is now invalid.`,
      );
      await load();
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const revokeClient = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setError("");
    setMessage("");
    try {
      await externalCapabilityApi.revokeClient(target.id);
      setRevokeTarget(null);
      setMessage(
        zh
          ? `${target.name} 已撤销；该 Key 不可恢复。`
          : `${target.name} revoked. Its key cannot be restored.`,
      );
      await load();
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  if (!isSudoActive) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <TabPanelLead
          description={
            zh
              ? "把 Blog 的受控只读 Capability 提供给服务端调用方；Client 独立持有 scope、限流与到期策略。"
              : "Expose governed read-only Blog capabilities to server-side callers with per-client scopes, rate limits, and expiry."
          }
          actions={
            <Button
              size="small"
              variant="solid"
              color="primary"
              icon={<Plus />}
              onClick={() => openEditor("new")}
              disabled={loading}
            >
              {zh ? "创建 API Client" : "Create API Client"}
            </Button>
          }
        />

        <TabPanelFeedback>
          {error ? (
            <Alert
              type="error"
              showIcon
              title={zh ? "操作失败" : "Operation failed"}
              description={error}
            />
          ) : null}
          {message ? (
            <Alert
              type="success"
              showIcon
              title={zh ? "操作完成" : "Operation complete"}
              description={message}
            />
          ) : null}
          <Alert
            type="info"
            showIcon
            title={
              zh ? "Server-to-server API 边界" : "Server-to-server API boundary"
            }
            description={
              zh
                ? "长期 API Key 只供服务端调用；浏览器请求不会使用这条通道。v1 仅开放显式授权的 read-only Capability。"
                : "Long-lived API keys are server-only. Browser requests do not use this channel, and v1 exposes only explicitly authorized read-only capabilities."
            }
          />
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
                  : "Callers first read their authorized capability catalog, then invoke a named capability. Keep the long-lived key only in the server Authorization header."}
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
                    : "Invoke authorized capability"}
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
                : "This surface does not expose browser CORS; requests carrying Origin are rejected. See OpenAPI for the complete request/response contract."}
            </Text>
          </div>
        </Card>

        {loading && !loaded ? (
          <Card padding="base">
            <div
              className="flex flex-col gap-3"
              aria-label={zh ? "正在加载 API Access" : "Loading API Access"}
            >
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Card>
        ) : (
          <>
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
                    : "Each client owns its capability allowlist, rate limit, and expiry. The key prefix is for audit identification, not authentication."}
                </Text>
              </div>
              {clients.length === 0 ? (
                <Card padding="base">
                  <Empty
                    title={zh ? "暂无 API Client" : "No API clients yet"}
                    description={
                      zh
                        ? "创建 Client 后会生成一次性 API Key。"
                        : "Create a client to generate a one-time API key."
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
                                ? `${zh ? "到期" : "Expires"}：${new Date(client.expires_at).toLocaleString()}`
                                : zh
                                  ? "不自动到期"
                                  : "No automatic expiry"}{" "}
                              ·{" "}
                              {client.last_used_at
                                ? `${zh ? "最近调用" : "Last used"}：${new Date(client.last_used_at).toLocaleString()}`
                                : zh
                                  ? "尚未调用"
                                  : "Never used"}
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
                              disabled={revoked}
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
                </Card>
              )}
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
                    : "This catalog comes from the same Tool Registry, but only read-only tools on the external surface can be granted."}
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
                <Heading id="external-audits-title" level={2} variant="compact">
                  {zh ? "最近调用" : "Recent invocations"}
                </Heading>
                <Text size="sm" tone="muted">
                  {zh
                    ? "审计只记录 Capability、结果、耗时和输入摘要，不保存完整 API Key 或原始参数。"
                    : "Audit evidence records capability, result, latency, and an input digest, never the full API key or raw arguments."}
                </Text>
              </div>
              <Card padding="none" className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {audits.length === 0 ? (
                    <div className="p-6">
                      <Text size="sm" tone="muted">
                        {zh ? "暂无调用记录。" : "No invocation records yet."}
                      </Text>
                    </div>
                  ) : (
                    audits.map((audit) => {
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
                              {new Date(audit.created_at).toLocaleString()}
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
                    })
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>

      <Drawer
        open={editing !== null}
        title={
          editing === "new"
            ? zh
              ? "创建 API Client"
              : "Create API Client"
            : zh
              ? `编辑 API Client：${editing?.name || ""}`
              : `Edit API Client: ${editing?.name || ""}`
        }
        description={
          zh
            ? "为服务端调用方分配显式只读 Capability、限流和到期策略；API Key 仅在创建或轮换后显示一次。"
            : "Assign explicit read-only capabilities, rate limits, and expiry to a server-side caller. The API key is shown only after creation or rotation."
        }
        width={720}
        onClose={closeEditor}
        footer={
          editing ? (
            <>
              <Button variant="outline" type="button" onClick={closeEditor}>
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button
                form="ai-settings-external-client-editor"
                type="submit"
                variant="solid"
                color="primary"
              >
                {zh ? "保存 API Client" : "Save API Client"}
              </Button>
            </>
          ) : null
        }
      >
        {editing ? (
          <div data-pattern="contextual-list-editor">
            <FormLayout
              id="ai-settings-external-client-editor"
              onSubmit={saveClient}
            >
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
                        : "The name identifies the caller. The key prefix is audit metadata, not an authentication credential."
                    }
                  >
                    <div className="flex flex-col gap-5">
                      <Field
                        label={zh ? "Client 名称" : "Client name"}
                        required
                      >
                        <Input
                          required
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Editorial Reporting SDK"
                        />
                      </Field>
                      {editing !== "new" ? (
                        <Field label={zh ? "Key 前缀" : "Key prefix"}>
                          <Input
                            value={editing.key_prefix}
                            readOnly
                            className="type-family-mono"
                          />
                        </Field>
                      ) : (
                        <Text size="xs" tone="muted">
                          {zh
                            ? "保存后生成高熵 API Key；完整 Key 只显示一次，服务器只保存其哈希。"
                            : "Saving generates a high-entropy API key. The full key is shown once; the server stores only its hash."}
                        </Text>
                      )}
                      <Switch
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                        label={zh ? "启用 Client" : "Enable client"}
                      />
                    </div>
                  </AISettingsEditorSection>

                  <AISettingsEditorSection
                    title={zh ? "调用策略" : "Call policy"}
                    description={
                      zh
                        ? "限流和到期时间属于 Client 策略；撤销后不能重新启用同一密钥。"
                        : "Rate limit and expiry belong to the client policy. A revoked key cannot be re-enabled."
                    }
                  >
                    <div className="flex flex-col gap-5">
                      <Field
                        label={zh ? "每分钟请求上限" : "Requests per minute"}
                      >
                        <Input
                          type="number"
                          min="1"
                          max="6000"
                          value={rateLimit}
                          onChange={(event) =>
                            setRateLimit(Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field
                        label={zh ? "到期时间" : "Expiry"}
                        hint={
                          zh
                            ? "留空表示不自动到期；生产环境建议设置轮换周期。"
                            : "Leave blank for no automatic expiry; production clients should use a rotation cycle."
                        }
                      >
                        <Input
                          type="datetime-local"
                          value={expiresAt}
                          onChange={(event) => setExpiresAt(event.target.value)}
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
                      : "v1 grants only explicit read-only capabilities. Write and proposal capabilities never appear here."
                  }
                >
                  {capabilities.length === 0 ? (
                    <Text size="sm" tone="muted">
                      {zh
                        ? "当前没有可外部授权的 Capability。"
                        : "No external capabilities are currently grantable."}
                    </Text>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {capabilities.map((capability) => {
                        const checked = selectedCapabilities.includes(
                          capability.name,
                        );
                        return (
                          <label
                            key={capability.name}
                            className="flex min-w-0 items-start gap-3 rounded-md border p-4"
                          >
                            <Checkbox
                              checked={checked}
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
                        );
                      })}
                    </div>
                  )}
                </AISettingsEditorSection>
              </div>
            </FormLayout>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(oneTimeKey)}
        title={zh ? "保存一次性 API Key" : "Save one-time API key"}
        description={
          zh
            ? "完整 Key 只在创建或轮换后展示一次；关闭后无法再次查看，只能重新轮换。"
            : "The full key is shown only after creation or rotation. Once closed it cannot be viewed again; rotate to obtain a replacement."
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
          <Text>{oneTimeKey?.client.name}</Text>
          <Input
            readOnly
            className="type-family-mono"
            value={oneTimeKey?.api_key || ""}
            aria-label={zh ? "一次性 API Key" : "One-time API key"}
          />
          <Alert
            type="warning"
            showIcon
            title={
              zh ? "不要放入浏览器代码" : "Do not put this in browser code"
            }
            description={
              zh
                ? "这个长期凭据只供服务端调用；服务器只保存其哈希，不保存明文。"
                : "This long-lived credential is for server-side callers only. The server stores only its hash, not the plaintext key."
            }
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        title={zh ? "确认撤销 API Client" : "Confirm API client revocation"}
        description={
          zh
            ? "撤销后该 Client 的当前 API Key 立即失效，且不能恢复；如需再次接入必须重新创建 Client。"
            : "Revocation immediately invalidates this client's current key and cannot be undone. Create a new client to reconnect later."
        }
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        onOk={() => void revokeClient()}
        okText={zh ? "撤销并使 Key 失效" : "Revoke and invalidate key"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ variant: "solid", color: "error" }}
        closeOnBackdrop
      >
        <Text>
          {zh
            ? `确定撤销「${revokeTarget?.name || ""}」吗？`
            : `Revoke "${revokeTarget?.name || ""}"?`}
        </Text>
      </Modal>
    </>
  );
}
