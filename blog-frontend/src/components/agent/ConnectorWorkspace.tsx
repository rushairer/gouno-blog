import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Edit2,
  Inbox,
  KeyRound,
  Play,
  Plus,
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
  Drawer,
  Empty,
  Field,
  FormGrid,
  FormLayout,
  Heading,
  IconButton,
  Input,
  Select,
  Tag,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { AISettingsEditorSection } from "./AISettingsEditorPatterns";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";

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
  const [editingProfile, setEditingProfile] = useState<
    ConnectorProfile | "new" | null
  >(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ConnectorKind>("newsletter");
  const [sandbox, setSandbox] = useState(true);
  const [enabled, setEnabled] = useState(true);
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

  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  const safeOutbox = Array.isArray(outbox) ? outbox : [];

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
    setProfiles(Array.isArray(profileData) ? profileData : []);
    setOutbox(Array.isArray(outboxData) ? outboxData : []);
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

  const openProfileEditor = (profile: ConnectorProfile | "new") => {
    setEditingProfile(profile);
    setError("");
    setCredential("");
    if (profile === "new") {
      setName("");
      setKind("newsletter");
      setSandbox(true);
      setEnabled(true);
      setConfig('{"rate_limit_per_minute":10}');
      return;
    }
    setName(profile.name);
    setKind(profile.kind);
    setSandbox(profile.sandbox);
    setEnabled(profile.enabled);
    setConfig(JSON.stringify(profile.config || {}, null, 2));
  };

  const closeProfileEditor = () => {
    setEditingProfile(null);
    setCredential("");
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await action(() =>
        connectorApi.saveProfile({
          id: editingProfile === "new" ? undefined : editingProfile?.id,
          name,
          kind,
          sandbox,
          enabled,
          config: JSON.parse(config),
          credential,
        }),
      );
      closeProfileEditor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    }
  };

  const startOAuth = async (id: number) => {
    try {
      const profile = safeProfiles.find((item) => item.id === id);
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
      <TabPanelLead
        description={
          zh
            ? "管理 Agent 可访问的 Sandbox 外部能力、OAuth 边界与 Outbox 审批链路。"
            : "Manage Sandbox external capabilities available to Agents, OAuth boundaries, and the Outbox approval path."
        }
        actions={
          <Button
            size="small"
            variant="solid"
            color="primary"
            type="button"
            icon={<Plus />}
            onClick={() => openProfileEditor("new")}
          >
            {zh ? "添加 Connector Profile" : "Add Connector Profile"}
          </Button>
        }
      />

      <TabPanelFeedback>
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
      </TabPanelFeedback>

      <Card padding="none" className="overflow-hidden">
        {safeProfiles.length === 0 ? (
          <CardContent className="p-6">
            <Empty
              icon={<Inbox />}
              title={
                zh ? "还没有连接器 Profile。" : "No connector profiles yet."
              }
              description={
                zh
                  ? "添加 Connector Profile 后可配置 Sandbox、OAuth 与 Outbox 边界。"
                  : "Add a Connector Profile to configure Sandbox, OAuth, and Outbox boundaries."
              }
            />
          </CardContent>
        ) : (
          <CardContent className="divide-y p-0">
            {safeProfiles.map((profile) => (
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
                  </div>
                  <Text size="xs" tone="muted">
                    {profile.kind} ·{" "}
                    {profile.sandbox ? "sandbox" : "read-only OAuth"}
                  </Text>
                  <Text size="xs" tone="muted">
                    {profile.has_credential
                      ? zh
                        ? `凭据 •••• ${profile.credential_last4 || ""}`
                        : `Credential •••• ${profile.credential_last4 || ""}`
                      : zh
                        ? "未配置凭据"
                        : "No credential"}
                  </Text>
                </div>
                <div className="flex min-w-max flex-nowrap items-center gap-1">
                  <IconButton
                    variant="ghost"
                    size="small"
                    label={
                      profile.kind === "search_console" && !profile.sandbox
                        ? zh
                          ? "连接 Google"
                          : "Connect Google"
                        : zh
                          ? "开始 Mock OAuth"
                          : "Start mock OAuth"
                    }
                    icon={<KeyRound />}
                    onClick={() => void startOAuth(profile.id)}
                  />
                  <IconButton
                    variant="ghost"
                    size="small"
                    label={zh ? "编辑 Connector" : "Edit Connector"}
                    icon={<Edit2 />}
                    onClick={() => openProfileEditor(profile)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Drawer
        open={editingProfile !== null}
        width={720}
        title={
          editingProfile === "new"
            ? zh
              ? "添加 Connector Profile"
              : "Add Connector Profile"
            : zh
              ? `编辑 Connector：${editingProfile?.name || ""}`
              : `Edit Connector: ${editingProfile?.name || ""}`
        }
        description={
          zh
            ? "配置 Connector 的产品身份、授权范围、Sandbox 与凭据状态。"
            : "Configure Connector identity, authorization boundary, Sandbox mode, and credential state."
        }
        onClose={closeProfileEditor}
        footer={
          editingProfile ? (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={closeProfileEditor}
              >
                {zh ? "取消" : "Cancel"}
              </Button>
              <Button
                form="ai-settings-connector-editor"
                type="submit"
                variant="solid"
                color="primary"
                disabled={
                  !name.trim() ||
                  (!sandbox &&
                    !credential.trim() &&
                    (editingProfile === "new" ||
                      !editingProfile.has_credential))
                }
              >
                {zh ? "保存 Connector" : "Save Connector"}
              </Button>
            </>
          ) : null
        }
      >
        {editingProfile ? (
          <div data-pattern="contextual-list-editor">
            <FormLayout
              id="ai-settings-connector-editor"
              data-pattern="editor-form-composition"
              onSubmit={saveProfile}
            >
              <div className="grid gap-5 xl:grid-cols-2">
                <AISettingsEditorSection
                  title={zh ? "连接身份" : "Connection identity"}
                  description={
                    zh
                      ? "定义 Connector 的产品名称、类型和启停状态。"
                      : "Define the Connector name, kind, and enabled state."
                  }
                >
                  <div className="flex flex-col gap-5">
                    <FormGrid columns={2}>
                      <Field label={zh ? "名称" : "Name"}>
                        <Input
                          required
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
                    <Field label={zh ? "状态" : "Status"}>
                      <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                        <Checkbox
                          checked={enabled}
                          onChange={(event) => setEnabled(event.target.checked)}
                        />
                        {zh ? "启用 Connector" : "Enable Connector"}
                      </label>
                    </Field>
                  </div>
                </AISettingsEditorSection>

                <AISettingsEditorSection
                  title={zh ? "运行与凭据" : "Runtime and credentials"}
                  description={
                    zh
                      ? "Sandbox、配置 JSON 与凭据状态显式分离；生产外部写入仍不在此能力范围。"
                      : "Keep Sandbox mode, config JSON, and credential state explicit; production external writes remain outside this capability."
                  }
                >
                  <div className="flex flex-col gap-5">
                    {kind === "search_console" ? (
                      <Field label={zh ? "连接模式" : "Connection mode"}>
                        <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                          <Checkbox
                            checked={sandbox}
                            onChange={(event) =>
                              setSandbox(event.target.checked)
                            }
                          />
                          {zh
                            ? "Sandbox（取消以启用只读 Google OAuth）"
                            : "Sandbox (uncheck for read-only Google OAuth)"}
                        </label>
                      </Field>
                    ) : null}

                    <Field label={zh ? "配置 JSON" : "Config JSON"}>
                      <Textarea
                        className="type-family-mono"
                        value={config}
                        onChange={(event) => setConfig(event.target.value)}
                        rows={6}
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
                      hint={
                        editingProfile !== "new" &&
                        editingProfile.has_credential
                          ? zh
                            ? "留空则保留现有凭据。"
                            : "Leave blank to keep the existing credential."
                          : undefined
                      }
                    >
                      <Input
                        type="password"
                        value={credential}
                        required={
                          !sandbox &&
                          (editingProfile === "new" ||
                            !editingProfile.has_credential)
                        }
                        onChange={(event) => setCredential(event.target.value)}
                        autoComplete="new-password"
                      />
                    </Field>
                  </div>
                </AISettingsEditorSection>
              </div>
            </FormLayout>
          </div>
        ) : null}
      </Drawer>

      {state ? (
        <Card padding="base">
          <div className="flex flex-col gap-4">
            <div>
              <Heading level={2} variant="compact">
                {zh ? "OAuth 回调" : "OAuth callback"}
              </Heading>
              <Text size="sm" tone="muted">
                {zh
                  ? "完成一次性 Mock 回调后，该状态即失效。"
                  : "The one-time Mock state expires after the callback completes."}
              </Text>
            </div>
            <FormGrid columns={2}>
              <Field label="State">
                <Input value={state} readOnly className="type-family-mono" />
              </Field>
              <Field label="Mock code">
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="type-family-mono"
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
            <Heading level={2} variant="compact">
              {zh ? "Outbox 沙箱" : "Outbox sandbox"}
            </Heading>
            <Text size="sm" tone="muted">
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
                  {safeProfiles.map((profile) => (
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
                className="type-family-mono"
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
          {safeOutbox.length === 0 ? (
            <div className="p-6">
              <Empty
                icon={<Inbox />}
                title={zh ? "Outbox 为空。" : "Outbox is empty."}
              />
            </div>
          ) : (
            <div className="divide-y">
              {safeOutbox.map((item) => {
                const profile = safeProfiles.find(
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
