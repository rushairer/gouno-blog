import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Inbox,
  KeyRound,
  Play,
  RotateCcw,
  ShieldOff,
} from "lucide-react";
import type {
  ConnectorKind,
  ConnectorOutboxItem,
  ConnectorProfile,
} from "../../types/agent";
import { connectorApi } from "../../api/connectors";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Empty,
  Field,
  FormGrid,
  IconButton,
  Input,
  Select,
  Tag,
  Text,
  Textarea,
} from "@gouno/ui/core";

type Locale = "en" | "zh";

const kinds: Array<{ value: ConnectorKind; zh: string; en: string }> = [
  { value: "search_console", zh: "Search Console", en: "Search Console" },
  { value: "newsletter", zh: "Newsletter", en: "Newsletter" },
  { value: "social", zh: "社交媒体", en: "Social" },
  { value: "webhook", zh: "Webhook", en: "Webhook" },
];

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function statusLabel(status: ConnectorOutboxItem["status"], zh: boolean) {
  return {
    awaiting_approval: zh ? "待审批" : "Awaiting approval",
    approved: zh ? "已批准" : "Approved",
    delivered: zh ? "已模拟投递" : "Mock delivered",
    failed: zh ? "失败，可重试" : "Failed, retryable",
    revoked: zh ? "已撤销" : "Revoked",
  }[status];
}

function statusTone(status: ConnectorOutboxItem["status"]) {
  if (status === "delivered") return "success" as const;
  if (status === "failed") return "error" as const;
  if (status === "awaiting_approval") return "warning" as const;
  if (status === "approved") return "primary" as const;
  return "default" as const;
}

export function ConnectorWorkspace({
  locale,
  onRefresh,
}: {
  locale: Locale;
  onRefresh: () => Promise<void>;
}) {
  const zh = locale === "zh";
  const [profiles, setProfiles] = useState<ConnectorProfile[]>([]);
  const [outbox, setOutbox] = useState<ConnectorOutboxItem[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ConnectorKind>("newsletter");
  const [sandbox, setSandbox] = useState(true);
  const [config, setConfig] = useState('{"rate_limit_per_minute":10}');
  const [credential, setCredential] = useState("");
  const [state, setState] = useState("");
  const [oauthProvider, setOAuthProvider] = useState<"mock" | "search_console">(
    "mock",
  );
  const [code, setCode] = useState("mock-code");
  const [selectedProfile, setSelectedProfile] = useState<number | "">("");
  const [key, setKey] = useState("");
  const [payload, setPayload] = useState(
    '{"source":"ai-workbench","message":"sandbox preview"}',
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const oauthResult = query.get("connector_oauth");
    const returnedState = query.get("state");
    const returnedCode = query.get("code");
    let changed = false;

    if (oauthResult === "connected") {
      setMessage(
        zh
          ? "Search Console 已连接。"
          : "Search Console connected successfully.",
      );
      query.delete("connector_oauth");
      changed = true;
    } else if (oauthResult === "failed") {
      setError(
        zh
          ? "Search Console 连接失败，请重试。"
          : "Search Console connection failed. Please try again.",
      );
      query.delete("connector_oauth");
      changed = true;
    }

    if (returnedState && returnedCode) {
      setState(returnedState);
      setCode(returnedCode);
      setOAuthProvider("search_console");
      query.delete("state");
      query.delete("code");
      changed = true;
    }

    if (changed) {
      const search = query.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
      );
    }
  }, [zh]);

  const load = useCallback(async () => {
    const [profileData, outboxData] = await Promise.all([
      connectorApi.getProfiles(),
      connectorApi.getOutbox(),
    ]);
    setProfiles(profileData);
    setOutbox(outboxData);
  }, []);

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [load]);

  const action = async (operation: () => Promise<unknown>) => {
    setError("");
    await operation();
    setMessage(zh ? "操作已完成。" : "Operation completed.");
    await load();
    await onRefresh();
  };

  const saveProfile = async () => {
    try {
      await action(() =>
        connectorApi.saveProfile({
          name,
          kind,
          sandbox,
          enabled: true,
          config: JSON.parse(config),
          credential,
        }),
      );
      setName("");
      setCredential("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    }
  };

  const startOAuth = async (id: number) => {
    try {
      const profile = profiles.find((item) => item.id === id);
      const real = profile?.kind === "search_console" && !profile.sandbox;
      if (real) {
        window.location.assign(`/api/admin/ai-connectors/${id}/oauth/start`);
        return;
      }
      const result = await connectorApi.startOAuth(
        id,
        real ? "search_console" : undefined,
      );
      setState(result.state);
      setOAuthProvider(real ? "search_console" : "mock");
      setMessage(
        zh
          ? "已生成一次性 Mock OAuth 状态。"
          : "One-time mock OAuth state generated.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    }
  };

  const completeOAuth = async () => {
    try {
      await action(() =>
        connectorApi.completeOAuth({
          state,
          code,
          provider: oauthProvider === "search_console" ? "search_console" : "",
        }),
      );
      setState("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    }
  };

  const queue = async () => {
    try {
      await action(() =>
        connectorApi.queueOutbox({
          connector_profile_id: Number(selectedProfile),
          idempotency_key: key,
          payload: JSON.parse(payload),
        }),
      );
      setKey("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Payload must be valid JSON",
      );
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Text size="sm" tone="muted" className="max-w-3xl leading-relaxed">
          {zh
            ? "管理 Agent 可访问的 Sandbox 外部能力、OAuth 边界与 Outbox 审批链路。"
            : "Manage Sandbox external capabilities available to Agents, OAuth boundaries, and the Outbox approval path."}
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        title={zh ? "Sandbox connector 边界" : "Sandbox connector boundary"}
        description={
          zh
            ? "Search Console 可使用只读 Google OAuth；其余连接器保持 Sandbox Mock。Outbox 必须先审批，再进行不可外发的 Mock 投递。"
            : "Search Console may use read-only Google OAuth. Other connectors remain Sandbox mocks. Outbox items require approval before non-network Mock delivery."
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

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]">
        <Card padding="base">
          <div className="flex flex-col gap-5">
            <div>
              <strong className="text-base">
                {zh ? "新建 Connector Profile" : "New Connector Profile"}
              </strong>
              <Text size="xs" tone="muted" className="mt-1">
                {zh
                  ? "先定义连接身份，再设置运行配置与凭据。"
                  : "Define the connection identity first, then its runtime configuration and credentials."}
              </Text>
            </div>

            <FormGrid columns={2}>
              <Field label={zh ? "名称" : "Name"}>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="search-console"
                />
              </Field>
              <Field label={zh ? "类型" : "Kind"}>
                <Select
                  aria-label={zh ? "类型" : "Kind"}
                  value={kind}
                  onChange={(value) => {
                    const next = selectValue(value) as ConnectorKind;
                    setKind(next);
                    if (next !== "search_console") setSandbox(true);
                  }}
                >
                  {kinds.map((item) => (
                    <option key={item.value} value={item.value}>
                      {zh ? item.zh : item.en}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormGrid>

            {kind === "search_console" ? (
              <Field label={zh ? "连接模式" : "Connection mode"}>
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sandbox}
                    onChange={(event) => setSandbox(event.target.checked)}
                  />
                  {zh
                    ? "Sandbox（取消以启用只读 Google OAuth）"
                    : "Sandbox (uncheck for read-only Google OAuth)"}
                </label>
              </Field>
            ) : null}

            <Field label={zh ? "配置 JSON" : "Config JSON"}>
              <Textarea
                className="font-mono"
                value={config}
                onChange={(event) => setConfig(event.target.value)}
                rows={4}
                placeholder='{"client_id":"...","redirect_uri":"https://...","site_url":"sc-domain:example.com"}'
              />
            </Field>

            <Field
              label={
                sandbox
                  ? zh
                    ? "凭据（Sandbox 可选）"
                    : "Credential (optional for Sandbox)"
                  : zh
                    ? "Google OAuth Client Secret（加密保存）"
                    : "Google OAuth client secret (encrypted)"
              }
            >
              <Input
                type="password"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <div className="flex justify-end border-t pt-4">
              <Button
                variant="solid"
                color="primary"
                type="button"
                disabled={!name.trim() || (!sandbox && !credential.trim())}
                onClick={() => void saveProfile()}
                icon={<KeyRound />}
              >
                {zh ? "保存 Profile" : "Save profile"}
              </Button>
            </div>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="border-b px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-base">
                  {zh ? "Connector Profiles" : "Connector Profiles"}
                </strong>
                <Text size="xs" tone="muted" className="mt-1">
                  {zh
                    ? "查看连接模式、凭据状态并发起对应的 OAuth 流程。"
                    : "Review connection mode and credential state, then start the appropriate OAuth flow."}
                </Text>
              </div>
              <Tag>{profiles.length}</Tag>
            </div>
          </div>

          {profiles.length === 0 ? (
            <CardContent className="p-6">
              <Empty
                icon={<Inbox />}
                title={
                  zh ? "还没有连接器 Profile。" : "No connector profiles yet."
                }
              />
            </CardContent>
          ) : (
            <CardContent className="divide-y p-0">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{profile.name}</strong>
                      <Tag color={profile.enabled ? "success" : "default"}>
                        {profile.enabled
                          ? zh
                            ? "已启用"
                            : "Enabled"
                          : zh
                            ? "已停用"
                            : "Disabled"}
                      </Tag>
                      <Tag>
                        {profile.sandbox ? "Sandbox" : "Read-only OAuth"}
                      </Tag>
                    </div>
                    <Text size="xs" tone="muted" className="mt-2">
                      {profile.kind} ·{" "}
                      {profile.has_credential
                        ? zh
                          ? `凭据 •••• ${profile.credential_last4 || ""}`
                          : `Credential •••• ${profile.credential_last4 || ""}`
                        : zh
                          ? "未配置凭据"
                          : "No credential"}
                    </Text>
                  </div>
                  <Button
                    variant="outline"
                    size="small"
                    type="button"
                    onClick={() => void startOAuth(profile.id)}
                    icon={<KeyRound />}
                  >
                    {profile.kind === "search_console" && !profile.sandbox
                      ? zh
                        ? "连接 Google"
                        : "Connect Google"
                      : zh
                        ? "开始 Mock OAuth"
                        : "Start mock OAuth"}
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>

      {state ? (
        <Card padding="base">
          <div className="flex flex-col gap-4">
            <div>
              <strong className="text-base">
                {zh ? "OAuth 回调" : "OAuth callback"}
              </strong>
              <Text size="xs" tone="muted" className="mt-1">
                {zh
                  ? "完成一次性 Mock 回调后，该状态即失效。"
                  : "The one-time Mock state expires after the callback completes."}
              </Text>
            </div>
            <FormGrid columns={2}>
              <Field label="State">
                <Input value={state} readOnly className="font-mono" />
              </Field>
              <Field label="Mock code">
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="font-mono"
                />
              </Field>
            </FormGrid>
            <div className="flex justify-end">
              <Button
                variant="solid"
                color="primary"
                type="button"
                onClick={() => void completeOAuth()}
                icon={<Check />}
              >
                {zh ? "完成 Mock 回调" : "Complete mock callback"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card padding="none" className="overflow-hidden">
        <div className="border-b px-6 py-5">
          <div>
            <strong className="text-base">
              {zh ? "Outbox 沙箱" : "Outbox sandbox"}
            </strong>
            <Text size="xs" tone="muted" className="mt-1 max-w-3xl">
              {zh
                ? "先审批，再进行不可外发的 Mock 投递；幂等键避免重复入队。"
                : "Approve first, then perform a non-network Mock delivery. Idempotency keys prevent duplicate queue entries."}
            </Text>
          </div>
        </div>

        <CardContent className="p-6">
          <div className="flex flex-col gap-5">
            <FormGrid columns={2}>
              <Field label="Profile">
                <Select
                  aria-label="Profile"
                  value={selectedProfile === "" ? "" : String(selectedProfile)}
                  onChange={(value) => {
                    const next = selectValue(value);
                    setSelectedProfile(next ? Number(next) : "");
                  }}
                >
                  <option value="">
                    {zh ? "选择 Profile" : "Choose profile"}
                  </option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={String(profile.id)}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={zh ? "幂等键" : "Idempotency key"}>
                <Input
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="run-2026-08-03"
                />
              </Field>
            </FormGrid>
            <Field label="Payload JSON">
              <Textarea
                className="font-mono"
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                rows={4}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="outline"
                type="button"
                disabled={!selectedProfile || !key.trim()}
                onClick={() => void queue()}
                icon={<Play />}
              >
                {zh ? "加入 Outbox" : "Queue Outbox item"}
              </Button>
            </div>
          </div>
        </CardContent>

        <div className="border-t">
          {outbox.length === 0 ? (
            <div className="p-6">
              <Empty
                icon={<Inbox />}
                title={zh ? "Outbox 为空。" : "Outbox is empty."}
              />
            </div>
          ) : (
            <div className="divide-y">
              {outbox.map((item) => {
                const profile = profiles.find(
                  (candidate) => candidate.id === item.connector_profile_id,
                );
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>
                          #{item.id} · {item.idempotency_key}
                        </strong>
                        <Tag color={statusTone(item.status)}>
                          {statusLabel(item.status, zh)}
                        </Tag>
                      </div>
                      <Text size="xs" tone="muted" className="mt-1">
                        {profile?.name ||
                          (zh ? "未知 Profile" : "Unknown profile")}
                        {item.error_message ? ` · ${item.error_message}` : ""}
                      </Text>
                    </div>
                    <div className="flex min-w-max flex-nowrap items-center gap-1">
                      {item.status === "awaiting_approval" ? (
                        <IconButton
                          variant="ghost"
                          label={zh ? "批准" : "Approve"}
                          icon={<Check />}
                          onClick={() =>
                            void action(() =>
                              connectorApi.actOnOutbox(item.id, "approve"),
                            )
                          }
                        />
                      ) : null}
                      {item.status === "approved" ? (
                        <IconButton
                          variant="ghost"
                          label={zh ? "Mock 投递" : "Mock deliver"}
                          icon={<Play />}
                          onClick={() =>
                            void action(() =>
                              connectorApi.actOnOutbox(item.id, "deliver-mock"),
                            )
                          }
                        />
                      ) : null}
                      {item.status === "failed" ? (
                        <IconButton
                          variant="ghost"
                          label={zh ? "重试" : "Retry"}
                          icon={<RotateCcw />}
                          onClick={() =>
                            void action(() =>
                              connectorApi.actOnOutbox(item.id, "retry"),
                            )
                          }
                        />
                      ) : null}
                      {["awaiting_approval", "approved", "failed"].includes(
                        item.status,
                      ) ? (
                        <IconButton
                          variant="ghost"
                          color="error"
                          label={zh ? "撤销" : "Revoke"}
                          icon={<ShieldOff />}
                          onClick={() =>
                            void action(() =>
                              connectorApi.actOnOutbox(item.id, "revoke"),
                            )
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
