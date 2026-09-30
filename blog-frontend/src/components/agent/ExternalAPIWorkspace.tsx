import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Edit2, KeyRound, Plus, RotateCcw, ShieldOff } from "lucide-react";
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
import { externalCapabilityApi } from "../../api/externalCapability";
import type {
  ExternalAPIClient,
  ExternalAPICreatedClient,
  ExternalCapability,
  ExternalInvocationAudit,
} from "../../types/externalCapability";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";

type ClientEditorState = ExternalAPIClient | "new" | null;

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toISOValue(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatTimestamp(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  if (!value) return locale === "zh" ? "尚未调用" : "Never used";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function resultColor(result: ExternalInvocationAudit["result"]) {
  if (result === "success") return "success" as const;
  if (result === "denied") return "warning" as const;
  return "error" as const;
}

export function ExternalAPIWorkspace({ locale }: { locale: "en" | "zh" }) {
  const zh = locale === "zh";
  const [clients, setClients] = useState<ExternalAPIClient[]>([]);
  const [capabilities, setCapabilities] = useState<ExternalCapability[]>([]);
  const [audits, setAudits] = useState<ExternalInvocationAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "warning";
    text: string;
  } | null>(null);
  const [editor, setEditor] = useState<ClientEditorState>(null);
  const [revokeTarget, setRevokeTarget] = useState<ExternalAPIClient | null>(
    null,
  );
  const [oneTimeKey, setOneTimeKey] = useState<ExternalAPICreatedClient | null>(
    null,
  );

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rateLimit, setRateLimit] = useState("60");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
    [],
  );

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextCapabilities, nextClients, nextAudits] = await Promise.all([
        externalCapabilityApi.getCapabilities(),
        externalCapabilityApi.getClients(),
        externalCapabilityApi.getAudits({ limit: 100 }),
      ]);
      setCapabilities(nextCapabilities || []);
      setClients(nextClients || []);
      setAudits(nextAudits || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (value: ExternalAPIClient | "new") => {
    setEditor(value);
    setError("");
    setNotice(null);
    if (value === "new") {
      setName("");
      setEnabled(true);
      setRateLimit("60");
      setExpiresAt("");
      setSelectedCapabilities([]);
      return;
    }
    setName(value.name);
    setEnabled(value.enabled);
    setRateLimit(String(value.rate_limit_per_minute));
    setExpiresAt(toLocalInputValue(value.expires_at));
    setSelectedCapabilities([...value.capabilities]);
  };

  const closeEditor = () => {
    setEditor(null);
    setName("");
    setEnabled(true);
    setRateLimit("60");
    setExpiresAt("");
    setSelectedCapabilities([]);
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
    if (!editor) return;
    const trimmedName = name.trim();
    const parsedRate = Number(rateLimit);
    const expiry = toISOValue(expiresAt);
    if (!trimmedName) {
      setError(zh ? "Client 名称不能为空。" : "Client name is required.");
      return;
    }
    if (!Number.isInteger(parsedRate) || parsedRate < 1 || parsedRate > 6000) {
      setError(
        zh
          ? "每分钟请求上限必须是 1–6000 的整数。"
          : "Requests per minute must be an integer between 1 and 6000.",
      );
      return;
    }
    if (expiresAt.trim() && !expiry) {
      setError(zh ? "到期时间无效。" : "Expiration time is invalid.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (editor === "new") {
        const created = await externalCapabilityApi.createClient({
          name: trimmedName,
          capabilities: selectedCapabilities,
          enabled,
          rate_limit_per_minute: parsedRate,
          expires_at: expiry,
        });
        setOneTimeKey(created);
        setNotice({
          type: "success",
          text: zh
            ? `${trimmedName} 已创建；请立即安全保存一次性 API Key。`
            : `${trimmedName} created. Store the one-time API key now.`,
        });
      } else {
        await externalCapabilityApi.updateClient(editor.id, {
          name: trimmedName,
          capabilities: selectedCapabilities,
          enabled,
          rate_limit_per_minute: parsedRate,
          expires_at: expiry,
        });
        setNotice({
          type: "success",
          text: zh
            ? `${trimmedName} 的 API Client 策略已更新。`
            : `${trimmedName} API client policy updated.`,
        });
      }
      closeEditor();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const rotateKey = async (client: ExternalAPIClient) => {
    setBusy(true);
    setError("");
    try {
      const rotated = await externalCapabilityApi.rotateClientKey(client.id);
      setOneTimeKey(rotated);
      setNotice({
        type: "success",
        text: zh
          ? `${client.name} 的 API Key 已轮换；旧 Key 立即失效。`
          : `${client.name} API key rotated. The previous key is invalid now.`,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const revokeClient = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    setError("");
    const target = revokeTarget;
    try {
      await externalCapabilityApi.revokeClient(target.id);
      setRevokeTarget(null);
      setNotice({
        type: "warning",
        text: zh
          ? `${target.name} 已撤销；该 API Key 不可恢复。`
          : `${target.name} revoked. The API key cannot be restored.`,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
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
            type="button"
            icon={<Plus />}
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
            zh ? "Server-to-server API 边界" : "Server-to-server API boundary"
          }
          description={
            zh
              ? "长期 API Key 只供服务端调用；浏览器请求不会使用这条通道。v1 仅开放显式授权的 read-only Capability。"
              : "Long-lived API keys are server-only. Browser requests do not use this channel. v1 exposes only explicitly granted read-only capabilities."
          }
        />
        {error ? (
          <Alert type="error" showIcon role="alert">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert type={notice.type} showIcon role="status">
            {notice.text}
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
                : "Callers first read their authorized capability catalog, then invoke a capability by name. Long-lived keys belong only in the server Authorization header."}
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
                {zh ? "执行已授权 Capability" : "Invoke authorized capability"}
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
              : "This endpoint does not provide browser CORS; browser requests carrying Origin are rejected. The OpenAPI contract is authoritative for request and response shapes."}
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
              : "Each client owns its capability allowlist, rate limit, and expiry. The key prefix is an audit identifier, not a usable credential."}
          </Text>
        </div>
        <Card padding="none" className="overflow-hidden">
          {loading ? (
            <CardContent className="p-6">
              <div
                role="status"
                aria-label={zh ? "正在加载 API Clients" : "Loading API clients"}
              >
                <Skeleton className="h-24 w-full" />
              </div>
            </CardContent>
          ) : clients.length === 0 ? (
            <CardContent className="p-6">
              <Empty
                icon={<KeyRound />}
                title={zh ? "还没有 API Client" : "No API clients yet"}
                description={
                  zh
                    ? "创建 Client 后会生成一次性长期 API Key；完整 Key 之后不会再次显示。"
                    : "Creating a client generates a one-time long-lived API key that will not be shown again."
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
                      <Text size="xs" tone="muted" className="type-family-mono">
                        {client.key_prefix}••••
                      </Text>
                      <div className="flex flex-wrap gap-2">
                        {client.capabilities.map((capability) => (
                          <Tag key={capability}>{capability}</Tag>
                        ))}
                      </div>
                      <Text size="xs" tone="muted">
                        {client.expires_at
                          ? `${zh ? "到期" : "Expires"}：${formatTimestamp(client.expires_at, locale)}`
                          : zh
                            ? "不自动到期"
                            : "No automatic expiry"}{" "}
                        · {zh ? "最近调用" : "Last used"}：
                        {formatTimestamp(client.last_used_at, locale)}
                      </Text>
                    </div>
                    <div className="flex min-w-max flex-nowrap items-center gap-1">
                      <IconButton
                        label={
                          zh ? `编辑 ${client.name}` : `Edit ${client.name}`
                        }
                        icon={<Edit2 />}
                        variant="ghost"
                        disabled={revoked || busy}
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
                        disabled={revoked || busy}
                        onClick={() => void rotateKey(client)}
                      />
                      <IconButton
                        label={
                          zh ? `撤销 ${client.name}` : `Revoke ${client.name}`
                        }
                        icon={<ShieldOff />}
                        variant="ghost"
                        color="error"
                        disabled={revoked || busy}
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
          <Heading id="external-capabilities-title" level={2} variant="compact">
            {zh ? "可授权 Capability" : "Grantable capabilities"}
          </Heading>
          <Text size="sm" tone="muted">
            {zh
              ? "目录来自同一个 Tool Registry，但只有 external surface 上的 read-only 能力可被 API Client 授权。"
              : "The catalog comes from the same Tool Registry, but API clients may receive only read-only capabilities on the external surface."}
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
              : "Audits record capability, result, duration, and input digest without storing the full API key or raw arguments."}
          </Text>
        </div>
        <Card padding="none" className="overflow-hidden">
          <CardContent className="divide-y p-0">
            {audits.length === 0 ? (
              <div className="p-6">
                <Empty
                  description={
                    zh ? "暂无外部调用记录" : "No external invocation records"
                  }
                />
              </div>
            ) : (
              audits.map((audit) => (
                <div
                  key={audit.id}
                  className="grid gap-3 p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <strong className="type-family-mono type-body-sm type-weight-semibold [overflow-wrap:anywhere]">
                      {audit.capability}
                    </strong>
                    <Text size="xs" tone="muted">
                      {clientMap.get(audit.client_id)?.name ||
                        `Client #${audit.client_id}`}{" "}
                      · {formatTimestamp(audit.created_at, locale)}
                    </Text>
                  </div>
                  <Tag color={resultColor(audit.result)}>
                    {audit.result} · HTTP {audit.status_code}
                  </Tag>
                  <Text size="xs" tone="muted">
                    {audit.duration_ms} ms
                  </Text>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Drawer
        open={editor !== null}
        width={720}
        title={
          editor === "new"
            ? zh
              ? "创建 API Client"
              : "Create API Client"
            : zh
              ? `编辑 API Client：${editor?.name || ""}`
              : `Edit API Client: ${editor?.name || ""}`
        }
        description={
          zh
            ? "为服务端调用方分配显式只读 Capability、限流和到期策略；API Key 仅在创建或轮换后显示一次。"
            : "Assign explicit read-only capabilities, rate limits, and expiry to a server caller. The full API key appears only after creation or rotation."
        }
        onClose={closeEditor}
        footer={
          editor ? (
            <>
              <Button variant="outline" type="button" onClick={closeEditor}>
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button
                form="ai-settings-external-client-editor"
                type="submit"
                variant="solid"
                color="primary"
                loading={busy}
                disabled={!name.trim()}
              >
                {zh ? "保存 API Client" : "Save API Client"}
              </Button>
            </>
          ) : null
        }
      >
        {editor ? (
          <div data-pattern="contextual-list-editor">
            <FormLayout
              id="ai-settings-external-client-editor"
              data-pattern="editor-form-composition"
              onSubmit={saveClient}
            >
              <div className="grid gap-5 xl:grid-cols-2">
                <AISettingsEditorSection
                  title={zh ? "Client 身份" : "Client identity"}
                  description={
                    zh
                      ? "名称用于识别调用方；Key 前缀只用于审计定位，不是可用凭据。"
                      : "The name identifies the caller. The key prefix is only an audit identifier, not a usable credential."
                  }
                >
                  <div className="flex flex-col gap-5">
                    <Field label={zh ? "Client 名称" : "Client name"} required>
                      <Input
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Editorial Reporting SDK"
                      />
                    </Field>
                    {editor !== "new" ? (
                      <Field label={zh ? "Key 前缀" : "Key prefix"}>
                        <Input
                          value={editor.key_prefix}
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
                    <Field label={zh ? "状态" : "Status"}>
                      <Switch
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                        label={zh ? "启用 Client" : "Enable client"}
                      />
                    </Field>
                  </div>
                </AISettingsEditorSection>

                <AISettingsEditorSection
                  title={zh ? "调用策略" : "Invocation policy"}
                  description={
                    zh
                      ? "限流和到期时间属于 Client 策略；撤销后不能重新启用同一密钥。"
                      : "Rate limits and expiry belong to the client policy. Revoked credentials cannot be re-enabled."
                  }
                >
                  <div className="flex flex-col gap-5">
                    <Field
                      label={zh ? "每分钟请求上限" : "Requests per minute"}
                      required
                    >
                      <Input
                        required
                        type="number"
                        min={1}
                        max={6000}
                        value={rateLimit}
                        onChange={(event) => setRateLimit(event.target.value)}
                      />
                    </Field>
                    <Field
                      label={zh ? "到期时间" : "Expiration"}
                      hint={
                        zh
                          ? "留空表示不自动到期；生产环境建议设置轮换周期。"
                          : "Leave blank for no automatic expiry. Production clients should use a rotation schedule."
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
                    : "v1 permits only explicitly granted read-only capabilities. Write and proposal capabilities are not available here."
                }
              >
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
              </AISettingsEditorSection>
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
            : "The full key is shown only after creation or rotation. Once closed, it cannot be viewed again and must be rotated instead."
        }
        onClose={() => setOneTimeKey(null)}
        onOk={() => setOneTimeKey(null)}
        okText={zh ? "我已安全保存" : "I stored it securely"}
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
                ? "这个长期凭据只供服务端调用；服务端数据库只保存它的哈希。"
                : "This long-lived credential is server-only; the database stores only its hash."
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
            : "Revoking immediately invalidates the current API key and cannot be undone. Reconnection requires a new client."
        }
        onClose={() => setRevokeTarget(null)}
        onOk={() => void revokeClient()}
        okText={zh ? "撤销并使 Key 失效" : "Revoke and invalidate key"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ variant: "solid", color: "error", loading: busy }}
        closeOnBackdrop
      >
        <Text>
          {zh
            ? `确定撤销「${revokeTarget?.name || ""}」吗？`
            : `Revoke “${revokeTarget?.name || ""}”?`}
        </Text>
      </Modal>
    </div>
  );
}
