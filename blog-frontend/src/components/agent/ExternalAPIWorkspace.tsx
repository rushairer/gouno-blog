import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Edit2, Plus, RotateCcw, ShieldOff } from "lucide-react";
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
  Skeleton,
  Tag,
  Text,
} from "@gouno/ui/core";
import { externalCapabilityApi } from "../../api/external-capabilities";
import { useSudoMode } from "../../hooks/useSudoMode";
import type {
  ExternalAPICreatedClient,
  ExternalAPIClient,
  ExternalAPIClientInput,
  ExternalAPIInvocationAudit,
  ExternalCapability,
} from "../../types/external-api";
import { SudoGate } from "../auth/SudoGate";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";

type Locale = "en" | "zh";

function requestError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toExpiresAt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function auditTone(result: string) {
  if (result === "success") return "success" as const;
  if (result === "denied" || result === "rate_limited") return "warning" as const;
  return "error" as const;
}

export function ExternalAPIWorkspace({
  locale,
  formatDateTime,
}: {
  locale: Locale;
  formatDateTime: (value: string) => string;
}) {
  const zh = locale === "zh";
  const { isSudoActive } = useSudoMode();
  const [clients, setClients] = useState<ExternalAPIClient[]>([]);
  const [capabilities, setCapabilities] = useState<ExternalCapability[]>([]);
  const [audits, setAudits] = useState<ExternalAPIInvocationAudit[]>([]);
  const [editingClient, setEditingClient] = useState<ExternalAPIClient | "new" | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rateLimit, setRateLimit] = useState("60");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [oneTimeKey, setOneTimeKey] = useState<ExternalAPICreatedClient | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ExternalAPIClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!isSudoActive) return;
    setLoading(true);
    setError("");
    try {
      const [clientData, capabilityData, auditData] = await Promise.all([
        externalCapabilityApi.getClients(),
        externalCapabilityApi.getCapabilities(),
        externalCapabilityApi.getAudits(undefined, 100),
      ]);
      setClients(Array.isArray(clientData) ? clientData : []);
      setCapabilities(Array.isArray(capabilityData) ? capabilityData : []);
      setAudits(Array.isArray(auditData) ? auditData : []);
    } catch (reason) {
      setError(requestError(reason, zh ? "加载 API Access 数据失败。" : "Failed to load API Access data."));
    } finally {
      setLoading(false);
    }
  }, [isSudoActive, zh]);

  useEffect(() => {
    if (!isSudoActive) {
      setClients([]);
      setCapabilities([]);
      setAudits([]);
      setEditingClient(null);
      setOneTimeKey(null);
      setRevokeTarget(null);
      setError("");
      setNotice("");
      return;
    }
    void load();
  }, [isSudoActive, load]);

  const openEditor = (client: ExternalAPIClient | "new") => {
    setEditingClient(client);
    setError("");
    setNotice("");
    if (client === "new") {
      setName("");
      setEnabled(true);
      setRateLimit("60");
      setExpiresAt("");
      setSelectedCapabilities([]);
      return;
    }
    setName(client.name);
    setEnabled(client.enabled);
    setRateLimit(String(client.rate_limit_per_minute));
    setExpiresAt(toLocalDateTime(client.expires_at));
    setSelectedCapabilities([...client.capabilities]);
  };

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
    if (!editingClient) return;
    const trimmedName = name.trim();
    const parsedRateLimit = Number(rateLimit);
    if (!trimmedName) {
      setError(zh ? "请输入 Client 名称。" : "Client name is required.");
      return;
    }
    if (!Number.isInteger(parsedRateLimit) || parsedRateLimit < 1 || parsedRateLimit > 6000) {
      setError(zh ? "每分钟请求上限必须是 1–6000 的整数。" : "Rate limit must be an integer from 1 to 6000.");
      return;
    }
    const payload: ExternalAPIClientInput = {
      name: trimmedName,
      capabilities: selectedCapabilities,
      enabled,
      rate_limit_per_minute: parsedRateLimit,
      expires_at: toExpiresAt(expiresAt),
    };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editingClient === "new") {
        const created = await externalCapabilityApi.createClient(payload);
        setOneTimeKey(created);
        setNotice(zh
          ? `${created.client.name} 已创建；请立即安全保存一次性 API Key。`
          : `${created.client.name} was created. Save the one-time API key now.`);
      } else {
        await externalCapabilityApi.updateClient(editingClient.id, payload);
        setNotice(zh ? `${trimmedName} 的调用策略已更新。` : `${trimmedName} policy updated.`);
      }
      setEditingClient(null);
      await load();
    } catch (reason) {
      setError(requestError(reason, zh ? "保存 API Client 失败。" : "Failed to save API Client."));
    } finally {
      setBusy(false);
    }
  };

  const rotateClient = async (client: ExternalAPIClient) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const rotated = await externalCapabilityApi.rotateClientKey(client.id);
      setOneTimeKey(rotated);
      setNotice(zh
        ? `${client.name} 的 API Key 已轮换；旧 Key 立即失效。`
        : `${client.name} API key rotated. The old key is now invalid.`);
      await load();
    } catch (reason) {
      setError(requestError(reason, zh ? "轮换 API Key 失败。" : "Failed to rotate API key."));
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await externalCapabilityApi.revokeClient(target.id);
      setRevokeTarget(null);
      setNotice(zh
        ? `${target.name} 已撤销；该 Key 不可恢复。`
        : `${target.name} revoked. Its key cannot be restored.`);
      await load();
    } catch (reason) {
      setError(requestError(reason, zh ? "撤销 API Client 失败。" : "Failed to revoke API Client."));
    } finally {
      setBusy(false);
    }
  };

  const clientMap = new Map(clients.map((client) => [client.id, client]));

  return (
    <div data-pattern="settings-composition" className="flex flex-col gap-5">
      <TabPanelLead
        description={zh
          ? "把 Blog 的受控只读 Capability 提供给服务端调用方；Client 独立持有 scope、限流与到期策略。"
          : "Expose governed read-only Blog capabilities to server-side callers. Each client owns its scopes, rate limit, and expiry policy."}
        actions={
          <Button size="small" variant="solid" color="primary" icon={<Plus />} disabled={!isSudoActive || busy} onClick={() => openEditor("new")}>
            {zh ? "创建 API Client" : "Create API Client"}
          </Button>
        }
      />
      <SudoGate
        title={zh ? "External API Client 与长期密钥保护" : "External API clients and long-lived keys"}
        description={zh
          ? "创建、修改、轮换或撤销服务端 API Client 会改变外部访问权限，需要近期多因素身份认证。"
          : "Creating, editing, rotating, or revoking server-side API clients changes external access and requires recent MFA."}
        actionLabel={zh ? "解锁以管理 API Access" : "Unlock API Access"}
      >
        <div className="flex flex-col gap-5">
          <TabPanelFeedback>
            <Alert type="info" showIcon title={zh ? "Server-to-server API 边界" : "Server-to-server API boundary"} description={zh
              ? "长期 API Key 只供服务端调用；浏览器请求不会使用这条通道。v1 仅开放显式授权的 read-only Capability。"
              : "Long-lived API keys are server-only. Browser requests do not use this channel. v1 exposes only explicitly granted read-only capabilities."} />
            {error ? <Alert type="error" showIcon title={error} /> : null}
            {notice ? <Alert type="success" showIcon title={notice} /> : null}
          </TabPanelFeedback>

          {loading ? (
            <Card padding="base">
              <div role="status" aria-label={zh ? "正在加载 API Access" : "Loading API Access"} className="flex flex-col gap-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </Card>
          ) : (
            <>
              <Card padding="base">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading level={2} variant="compact">{zh ? "调用协议" : "Invocation protocol"}</Heading>
                      <Tag color="success">server-to-server</Tag>
                    </div>
                    <Text size="sm" tone="muted">{zh
                      ? "调用方先读取已授权 Capability 目录，再按名称执行；长期 API Key 只放在服务端 Authorization Header 中。"
                      : "Callers first read the authorized Capability catalog, then invoke by name. Keep the long-lived API key only in a server-side Authorization header."}</Text>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md border p-4">
                      <Text size="xs" tone="muted">{zh ? "Capability 目录" : "Capability catalog"}</Text>
                      <strong className="mt-1 block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">GET /api/external/v1/capabilities</strong>
                    </div>
                    <div className="rounded-md border p-4">
                      <Text size="xs" tone="muted">{zh ? "执行已授权 Capability" : "Invoke authorized Capability"}</Text>
                      <strong className="mt-1 block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">{"POST /api/external/v1/capabilities/{name}/invoke"}</strong>
                    </div>
                  </div>
                  <Text size="xs" tone="muted" className="type-family-mono [overflow-wrap:anywhere]">Authorization: Bearer gouno_live_…</Text>
                  <Text size="xs" tone="muted">{zh
                    ? "该入口不提供浏览器 CORS；带 Origin 的浏览器请求会被拒绝。完整请求/响应结构以 OpenAPI 契约为准。"
                    : "This surface does not provide browser CORS; requests carrying Origin are rejected. Refer to the OpenAPI contract for complete request and response schemas."}</Text>
                </div>
              </Card>

              <section className="flex flex-col gap-3" aria-labelledby="external-clients-title">
                <div>
                  <Heading id="external-clients-title" level={2} variant="compact">API Clients</Heading>
                  <Text size="sm" tone="muted">{zh
                    ? "每个 Client 独立控制 Capability 白名单、限流和到期时间；Key 前缀用于审计定位，不是可用凭据。"
                    : "Each client owns a Capability allowlist, rate limit, and expiry. The key prefix is audit metadata, not a usable credential."}</Text>
                </div>
                {clients.length === 0 ? (
                  <Card padding="base"><Empty title={zh ? "暂无 API Client" : "No API Clients"} description={zh ? "创建 Client 后才能向服务端调用方发放一次性长期密钥。" : "Create a client before issuing a one-time long-lived server credential."} /></Card>
                ) : (
                  <Card padding="none" className="overflow-hidden">
                    <CardContent className="divide-y p-0">
                      {clients.map((client) => {
                        const revoked = Boolean(client.revoked_at);
                        return (
                          <div key={client.id} className="flex flex-col gap-4 p-6 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong>{client.name}</strong>
                                <Tag color={revoked ? "error" : client.enabled ? "success" : "default"}>
                                  {revoked ? (zh ? "已撤销" : "Revoked") : client.enabled ? (zh ? "已启用" : "Enabled") : (zh ? "已停用" : "Disabled")}
                                </Tag>
                                <Tag>{client.rate_limit_per_minute}/min</Tag>
                              </div>
                              <Text size="xs" tone="muted" className="type-family-mono">{client.key_prefix}••••</Text>
                              <div className="flex flex-wrap gap-2">{client.capabilities.map((capability) => <Tag key={capability}>{capability}</Tag>)}</div>
                              <Text size="xs" tone="muted">
                                {client.expires_at ? `${zh ? "到期" : "Expires"}：${formatDateTime(client.expires_at)}` : zh ? "不自动到期" : "No automatic expiry"} · {zh ? "最近调用" : "Last used"}：{client.last_used_at ? formatDateTime(client.last_used_at) : zh ? "尚未调用" : "Never"}
                              </Text>
                            </div>
                            <div className="flex min-w-max flex-nowrap items-center gap-1">
                              <IconButton label={zh ? `编辑 ${client.name}` : `Edit ${client.name}`} icon={<Edit2 />} variant="ghost" disabled={revoked || busy} onClick={() => openEditor(client)} />
                              <IconButton label={zh ? `轮换 ${client.name} Key` : `Rotate ${client.name} key`} icon={<RotateCcw />} variant="ghost" disabled={revoked || busy} onClick={() => void rotateClient(client)} />
                              <IconButton label={zh ? `撤销 ${client.name}` : `Revoke ${client.name}`} icon={<ShieldOff />} variant="ghost" color="error" disabled={revoked || busy} onClick={() => setRevokeTarget(client)} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="external-capabilities-title">
                <div>
                  <Heading id="external-capabilities-title" level={2} variant="compact">{zh ? "可授权 Capability" : "Grantable Capabilities"}</Heading>
                  <Text size="sm" tone="muted">{zh
                    ? "目录来自同一个 Tool Registry，但只有 external surface 上的 read-only 能力可被 API Client 授权。"
                    : "The catalog comes from the same Tool Registry, but only read-only capabilities on the external surface can be granted to API clients."}</Text>
                </div>
                {capabilities.length === 0 ? (
                  <Card padding="base"><Empty description={zh ? "暂无可授权 Capability" : "No grantable Capabilities"} /></Card>
                ) : (
                  <Card padding="none" className="overflow-hidden">
                    <CardContent className="divide-y p-0">
                      {capabilities.map((capability) => (
                        <div key={capability.name} className="grid gap-2 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0">
                            <strong className="type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">{capability.name}</strong>
                            <Text size="xs" tone="muted">{zh ? capability.description_zh || capability.description : capability.description}</Text>
                          </div>
                          <Tag color="success">read-only</Tag>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="external-audits-title">
                <div>
                  <Heading id="external-audits-title" level={2} variant="compact">{zh ? "最近调用" : "Recent invocations"}</Heading>
                  <Text size="sm" tone="muted">{zh
                    ? "审计只记录 Capability、结果、耗时和输入摘要，不保存完整 API Key 或原始参数。"
                    : "Audit evidence stores Capability, result, duration, and an input digest, never a full API key or raw arguments."}</Text>
                </div>
                {audits.length === 0 ? (
                  <Card padding="base"><Empty description={zh ? "暂无调用记录" : "No invocation records"} /></Card>
                ) : (
                  <Card padding="none" className="overflow-hidden">
                    <CardContent className="divide-y p-0">
                      {audits.map((audit) => {
                        const client = clientMap.get(audit.client_id);
                        return (
                          <div key={audit.id} className="grid gap-3 p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                            <div className="min-w-0">
                              <strong className="type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">{audit.capability}</strong>
                              <Text size="xs" tone="muted">{client?.name || `Client #${audit.client_id}`} · {formatDateTime(audit.created_at)}</Text>
                            </div>
                            <Tag color={auditTone(audit.result)}>{audit.result} · HTTP {audit.status_code}</Tag>
                            <Text size="xs" tone="muted">{audit.duration_ms} ms</Text>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </section>
            </>
          )}
        </div>
      </SudoGate>

      <Drawer
        open={editingClient !== null}
        title={editingClient === "new" ? (zh ? "创建 API Client" : "Create API Client") : zh ? `编辑 API Client：${editingClient?.name || ""}` : `Edit API Client: ${editingClient?.name || ""}`}
        description={zh ? "为服务端调用方分配显式只读 Capability、限流和到期策略；API Key 仅在创建或轮换后显示一次。" : "Assign explicit read-only Capabilities, rate limits, and expiry policy to a server-side caller. The API key is shown only after create or rotate."}
        width={720}
        onClose={() => setEditingClient(null)}
        footer={editingClient ? (
          <>
            <Button variant="outline" type="button" onClick={() => setEditingClient(null)}>{zh ? "取消" : "Cancel"}</Button>
            <Button form="ai-settings-external-client-editor" type="submit" variant="solid" color="primary" disabled={busy}>{zh ? "保存 API Client" : "Save API Client"}</Button>
          </>
        ) : null}
      >
        {editingClient ? (
          <div data-pattern="contextual-list-editor">
            <form id="ai-settings-external-client-editor" onSubmit={saveClient}>
              <div data-pattern="editor-form-composition" className="flex flex-col gap-5">
                <div className="grid gap-5 xl:grid-cols-2">
                  <AISettingsEditorSection title={zh ? "Client 身份" : "Client identity"} description={zh ? "名称用于识别调用方；Key 前缀只用于审计定位，不是可用凭据。" : "The name identifies the caller. The key prefix is audit metadata, not a usable credential."}>
                    <div className="flex flex-col gap-5">
                      <Field label={zh ? "Client 名称" : "Client name"} required>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Editorial Reporting SDK" />
                      </Field>
                      {editingClient !== "new" ? (
                        <Field label={zh ? "Key 前缀" : "Key prefix"}><Input value={editingClient.key_prefix} readOnly className="type-family-mono" /></Field>
                      ) : (
                        <Text size="xs" tone="muted">{zh ? "保存后生成高熵 API Key；完整 Key 只显示一次，后端只保存摘要。" : "Saving generates a high-entropy API key. The full key is shown once; the backend stores only its digest."}</Text>
                      )}
                      <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                        <Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                        {zh ? "启用 Client" : "Enable Client"}
                      </label>
                    </div>
                  </AISettingsEditorSection>
                  <AISettingsEditorSection title={zh ? "调用策略" : "Invocation policy"} description={zh ? "限流和到期时间属于 Client 策略；撤销后不能重新启用同一密钥。" : "Rate limit and expiry belong to the Client policy. A revoked key cannot be re-enabled."}>
                    <div className="flex flex-col gap-5">
                      <Field label={zh ? "每分钟请求上限" : "Requests per minute"}>
                        <Input type="number" min={1} max={6000} value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
                      </Field>
                      <Field label={zh ? "到期时间" : "Expires at"} hint={zh ? "留空表示不自动到期；生产环境建议设置轮换周期。" : "Leave empty for no automatic expiry. Production clients should have a rotation policy."}>
                        <Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                      </Field>
                    </div>
                  </AISettingsEditorSection>
                </div>
                <AISettingsEditorSection title={zh ? "Capability 白名单" : "Capability allowlist"} description={zh ? "v1 只允许显式授权的 read-only Capability；写入和提案能力不会出现在这里。" : "v1 permits only explicitly granted read-only Capabilities. Write and proposal capabilities are not present here."}>
                  {capabilities.length === 0 ? (
                    <Empty description={zh ? "暂无可授权 Capability" : "No grantable Capabilities"} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {capabilities.map((capability) => (
                        <label key={capability.name} className="flex min-w-0 items-start gap-3 rounded-md border p-4">
                          <Checkbox checked={selectedCapabilities.includes(capability.name)} onChange={(event) => toggleCapability(capability.name, event.target.checked)} />
                          <span className="min-w-0 flex-1">
                            <strong className="block type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">{capability.name}</strong>
                            <Text size="xs" tone="muted">{zh ? capability.description_zh || capability.description : capability.description}</Text>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </AISettingsEditorSection>
              </div>
            </form>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={oneTimeKey !== null}
        title={zh ? "保存一次性 API Key" : "Save one-time API key"}
        description={zh ? "完整 Key 只在创建或轮换后展示一次；关闭后无法再次查看，只能重新轮换。" : "The full key is shown only after create or rotate. After closing, it cannot be viewed again; rotate to issue another key."}
        onClose={() => setOneTimeKey(null)}
        onOk={() => setOneTimeKey(null)}
        okText={zh ? "我已安全保存" : "I saved it securely"}
        cancelText={zh ? "关闭" : "Close"}
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-3">
          <Text>{oneTimeKey?.client.name}</Text>
          <Input readOnly className="type-family-mono" value={oneTimeKey?.api_key || ""} aria-label={zh ? "一次性 API Key" : "One-time API key"} />
          <Alert type="warning" showIcon title={zh ? "不要放入浏览器代码" : "Do not put this in browser code"} description={zh ? "这个长期凭据只供服务端调用；后端只保存其 SHA-256 摘要，不保存明文。" : "This long-lived credential is server-only. The backend stores only its SHA-256 digest, never plaintext."} />
        </div>
      </Modal>

      <Modal
        open={revokeTarget !== null}
        title={zh ? "确认撤销 API Client" : "Confirm API Client revocation"}
        description={zh ? "撤销后该 Client 的当前 API Key 立即失效，且不能恢复；如需再次接入必须重新创建 Client。" : "Revocation immediately invalidates the current API key and cannot be undone. Create a new Client to reconnect later."}
        onClose={() => setRevokeTarget(null)}
        onOk={() => void confirmRevoke()}
        okText={zh ? "撤销并使 Key 失效" : "Revoke and invalidate key"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ variant: "solid", color: "error", disabled: busy }}
        closeOnBackdrop
      >
        <Text>{zh ? `确定撤销「${revokeTarget?.name || ""}」吗？` : `Revoke “${revokeTarget?.name || ""}”?`}</Text>
      </Modal>
    </div>
  );
}
