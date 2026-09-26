import { KeyRound, Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type {
  ProviderProfile,
  ProviderType,
  ProviderVendor,
} from "../../types/agent";
import { emptyProvider } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  FormGrid,
  FormLayout,
  Input,
  Select,
} from "@gouno/ui/core";
import {
  AISettingsEditorHeader,
  AISettingsEditorSection,
} from "./AISettingsEditorPatterns";

export interface ProviderFormValue {
  id?: number;
  name: string;
  provider_type: ProviderType;
  vendor: ProviderVendor;
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
  protocol_mode: string;
  stream_mode: string;
  request_timeout_seconds: number;
  max_output_tokens: number;
}

const vendorPresets: Record<
  ProviderVendor,
  {
    label: string;
    providerType: ProviderType;
    baseURL: string;
    protocolMode: string;
    modelPlaceholder: string;
    protocols: ProviderType[];
  }
> = {
  openai: {
    label: "OpenAI",
    providerType: "openai",
    baseURL: "https://api.openai.com",
    protocolMode: "chat_completions",
    modelPlaceholder: "gpt-5.6",
    protocols: ["openai"],
  },
  anthropic: {
    label: "Anthropic",
    providerType: "anthropic",
    baseURL: "https://api.anthropic.com",
    protocolMode: "",
    modelPlaceholder: "claude-sonnet-5",
    protocols: ["anthropic"],
  },
  google: {
    label: "Google Gemini",
    providerType: "gemini",
    baseURL: "https://generativelanguage.googleapis.com",
    protocolMode: "generate_content",
    modelPlaceholder: "gemini-3.1-pro",
    protocols: ["gemini"],
  },
  deepseek: {
    label: "DeepSeek",
    providerType: "openai",
    baseURL: "https://api.deepseek.com",
    protocolMode: "chat_completions",
    modelPlaceholder: "deepseek-flash",
    protocols: ["openai", "anthropic"],
  },
  alibaba: {
    label: "Alibaba Model Studio / Qwen",
    providerType: "openai",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "qwen-plus",
    protocols: ["openai", "anthropic"],
  },
  volcengine: {
    label: "Volcengine Ark / Doubao",
    providerType: "openai",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    protocolMode: "chat_completions",
    modelPlaceholder: "doubao-seed-2-1-pro-260628",
    protocols: ["openai", "anthropic"],
  },
  moonshot: {
    label: "Moonshot / Kimi",
    providerType: "openai",
    baseURL: "https://api.moonshot.cn/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "kimi-k2",
    protocols: ["openai"],
  },
  tencent: {
    label: "Tencent Hunyuan",
    providerType: "openai",
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "hunyuan-turbos-latest",
    protocols: ["openai"],
  },
  zhipu: {
    label: "Zhipu GLM",
    providerType: "openai",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    protocolMode: "chat_completions",
    modelPlaceholder: "glm-5",
    protocols: ["openai", "anthropic"],
  },
  baidu: {
    label: "Baidu Qianfan",
    providerType: "openai",
    baseURL: "https://qianfan.baidubce.com/v2",
    protocolMode: "chat_completions",
    modelPlaceholder: "model-id",
    protocols: ["openai"],
  },
  minimax: {
    label: "MiniMax",
    providerType: "openai",
    baseURL: "https://api.minimax.io/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "model-id",
    protocols: ["openai"],
  },
  xai: {
    label: "xAI",
    providerType: "openai",
    baseURL: "https://api.x.ai",
    protocolMode: "chat_completions",
    modelPlaceholder: "grok-4",
    protocols: ["openai"],
  },
  mistral: {
    label: "Mistral AI",
    providerType: "openai",
    baseURL: "https://api.mistral.ai/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "mistral-large-latest",
    protocols: ["openai"],
  },
  custom: {
    label: "Custom / Compatible",
    providerType: "openai",
    baseURL: "",
    protocolMode: "chat_completions",
    modelPlaceholder: "model-id",
    protocols: ["openai", "anthropic", "gemini"],
  },
};

function fallbackVendor(providerType: ProviderType): ProviderVendor {
  if (providerType === "anthropic") return "anthropic";
  if (providerType === "gemini") return "google";
  return "openai";
}

function vendorProtocolBaseURL(
  vendor: ProviderVendor,
  providerType: ProviderType,
  currentBaseURL: string,
): string {
  if (vendor === "deepseek") {
    if (providerType === "anthropic")
      return "https://api.deepseek.com/anthropic";
    if (providerType === "openai") return vendorPresets.deepseek.baseURL;
  }
  if (vendor === "alibaba") {
    if (providerType === "anthropic")
      return "https://dashscope.aliyuncs.com/apps/anthropic";
    if (providerType === "openai") return vendorPresets.alibaba.baseURL;
  }
  if (vendor === "volcengine") {
    if (providerType === "anthropic")
      return "https://ark.cn-beijing.volces.com/api/compatible";
    if (providerType === "openai") return vendorPresets.volcengine.baseURL;
  }
  if (vendor === "zhipu") {
    if (providerType === "anthropic")
      return "https://open.bigmodel.cn/api/anthropic";
    if (providerType === "openai") return vendorPresets.zhipu.baseURL;
  }
  const preset = vendorPresets[vendor];
  if (providerType === preset.providerType && preset.baseURL) {
    return preset.baseURL;
  }
  return currentBaseURL;
}

export function ProviderForm({
  initial,
  labels,
  onSave,
  onCancel,
  surface = "page",
}: {
  initial?: ProviderProfile;
  labels: Record<string, string>;
  onSave: (value: ProviderFormValue) => Promise<void>;
  onCancel: () => void;
  surface?: "page" | "drawer";
}) {
  const [value, setValue] = useState<ProviderFormValue>(() =>
    initial
      ? {
          id: initial.id,
          name: initial.name,
          provider_type: initial.provider_type,
          vendor: initial.vendor || fallbackVendor(initial.provider_type),
          base_url: initial.base_url,
          model: initial.model,
          api_key: "",
          enabled: initial.enabled,
          protocol_mode:
            initial.protocol_mode ||
            (initial.provider_type === "openai"
              ? "chat_completions"
              : initial.provider_type === "gemini"
                ? "generate_content"
                : ""),
          stream_mode: initial.stream_mode || "auto",
          request_timeout_seconds: initial.request_timeout_seconds,
          max_output_tokens: initial.max_output_tokens,
        }
      : {
          ...emptyProvider,
          vendor: "openai",
          protocol_mode: "chat_completions",
          stream_mode: "auto",
        },
  );
  const [saving, setSaving] = useState(false);
  const draftKey = `provider-${initial?.id ?? "new"}`;
  const { clearDraft } = useFormDraft(draftKey, value, setValue);
  const activeVendor =
    value.vendor || fallbackVendor(value.provider_type || "openai");
  const activeVendorPreset = vendorPresets[activeVendor];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...value, vendor: activeVendor });
      clearDraft();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const setVendor = (nextValue: string | string[]) => {
    const vendor = String(nextValue) as ProviderVendor;
    const preset = vendorPresets[vendor];
    setValue((current) => ({
      ...current,
      vendor,
      provider_type: preset.providerType,
      base_url: vendor === "custom" ? current.base_url : preset.baseURL,
      protocol_mode: preset.protocolMode,
    }));
  };

  const setProviderType = (nextValue: string | string[]) => {
    const providerType = String(nextValue) as ProviderType;
    setValue((current) => ({
      ...current,
      provider_type: providerType,
      base_url: vendorProtocolBaseURL(
        current.vendor || fallbackVendor(current.provider_type),
        providerType,
        current.base_url,
      ),
      protocol_mode:
        providerType === "openai"
          ? "chat_completions"
          : providerType === "gemini"
            ? "generate_content"
            : "",
    }));
  };

  const protocolFields =
    value.provider_type === "openai" ? (
      <FormGrid columns={2}>
        <Field label={labels.protocolMode || "接口协议模式"}>
          <Select
            value={value.protocol_mode || "chat_completions"}
            onChange={(nextValue) =>
              setValue((current) => ({
                ...current,
                protocol_mode: String(nextValue),
              }))
            }
          >
            <option value="chat_completions">
              {labels.protocolModeChatCompletions ||
                "Chat Completions (/v1/chat/completions · 通用标准)"}
            </option>
            <option value="responses">
              {labels.protocolModeResponses ||
                "Responses API (/v1/responses · OpenAI 原生)"}
            </option>
          </Select>
        </Field>
        <Field label={labels.streamMode || "流式传输 (Stream)"}>
          <Select
            value={value.stream_mode || "auto"}
            onChange={(nextValue) =>
              setValue((current) => ({
                ...current,
                stream_mode: String(nextValue),
              }))
            }
          >
            <option value="auto">
              {labels.streamModeAuto || "自动自适应 (推荐)"}
            </option>
            <option value="always">
              {labels.streamModeAlways || "强制开启 (Stream: true)"}
            </option>
            <option value="never">
              {labels.streamModeNever || "强制关闭 (Stream: false)"}
            </option>
          </Select>
        </Field>
      </FormGrid>
    ) : value.provider_type === "gemini" ? (
      <FormGrid columns={2}>
        <Field label={labels.protocolMode || "接口协议模式"}>
          <Select
            value={value.protocol_mode || "generate_content"}
            onChange={(nextValue) =>
              setValue((current) => ({
                ...current,
                protocol_mode: String(nextValue),
              }))
            }
          >
            <option value="generate_content">
              {labels.protocolModeGenerateContent ||
                "GenerateContent (Gemini 原生多模态出图)"}
            </option>
            <option value="predict">
              {labels.protocolModePredict || "Predict (Imagen 3 专属)"}
            </option>
          </Select>
        </Field>
        <Field label={labels.streamMode || "流式传输 (Stream)"}>
          <Select
            value={value.stream_mode || "auto"}
            onChange={(nextValue) =>
              setValue((current) => ({
                ...current,
                stream_mode: String(nextValue),
              }))
            }
          >
            <option value="auto">
              {labels.streamModeAuto || "自动自适应 (推荐)"}
            </option>
            <option value="always">
              {labels.streamModeAlways || "强制开启 (Stream: true)"}
            </option>
            <option value="never">
              {labels.streamModeNever || "强制关闭 (Stream: false)"}
            </option>
          </Select>
        </Field>
      </FormGrid>
    ) : (
      <Field label={labels.streamMode || "流式传输 (Stream)"}>
        <Select
          value={value.stream_mode || "auto"}
          onChange={(nextValue) =>
            setValue((current) => ({
              ...current,
              stream_mode: String(nextValue),
            }))
          }
        >
          <option value="auto">
            {labels.streamModeAuto || "自动自适应 (推荐)"}
          </option>
          <option value="always">
            {labels.streamModeAlways || "强制开启 (Stream: true)"}
          </option>
          <option value="never">
            {labels.streamModeNever || "强制关闭 (Stream: false)"}
          </option>
        </Select>
      </Field>
    );

  return (
    <FormLayout id="ai-settings-provider-editor" onSubmit={submit}>
      <div
        data-pattern="editor-form-composition"
        className="flex flex-col gap-5"
      >
        {surface === "page" ? (
          <AISettingsEditorHeader
            title={
              initial
                ? `${labels.editProvider}：${initial.name}`
                : labels.createProvider
            }
            description="模型连接把供应商身份、协议、端点、模型和凭据收敛到一个可测试、可切换的连接配置。"
            icon={<KeyRound />}
          />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <AISettingsEditorSection
            title="连接身份"
            description="名称和供应商类型用于识别连接；启停状态决定它是否可被 Agent 或默认模型选择。"
          >
            <FormGrid columns={2}>
              <Field label={labels.providerName}>
                <Input
                  required
                  value={value.name}
                  onChange={(event) =>
                    setValue((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={labels.providerVendor || "供应商"}>
                <Select value={activeVendor} onChange={setVendor}>
                  {Object.entries(vendorPresets).map(([vendor, preset]) => (
                    <option key={vendor} value={vendor}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
          </AISettingsEditorSection>

          <AISettingsEditorSection
            title="模型与端点"
            description="协议和流式策略属于连接能力；端点、模型、超时与输出限制共同决定实际请求行为。"
          >
            <div className="flex flex-col gap-5">
              <FormGrid columns={2}>
                <Field label={labels.providerProtocol || "接口协议"}>
                  <Select value={value.provider_type} onChange={setProviderType}>
                    <option
                      value="openai"
                      disabled={!activeVendorPreset.protocols.includes("openai")}
                    >
                      {labels.protocolOpenAICompatible || "OpenAI Compatible"}
                    </option>
                    <option
                      value="anthropic"
                      disabled={
                        !activeVendorPreset.protocols.includes(
                          "anthropic",
                        )
                      }
                    >
                      {labels.protocolAnthropicMessages || "Anthropic Messages"}
                    </option>
                    <option
                      value="gemini"
                      disabled={!activeVendorPreset.protocols.includes("gemini")}
                    >
                      {labels.protocolGeminiNative || "Gemini Native"}
                    </option>
                  </Select>
                </Field>
                <Field label={labels.baseUrl}>
                  <Input
                    className="font-mono"
                    type="url"
                    required
                    value={value.base_url}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        base_url: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FormGrid>

              <FormGrid columns={2}>
                <Field label={labels.model}>
                  <Input
                    className="font-mono"
                    required
                    placeholder={activeVendorPreset.modelPlaceholder || "model-id"}
                    value={value.model}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FormGrid>

              {protocolFields}

              <FormGrid columns={2}>
                <Field
                  label={labels.timeout}
                  hint="图片生成模型建议设为 900 秒；最长 1800 秒。"
                >
                  <Input
                    type="number"
                    min="1"
                    max="1800"
                    value={value.request_timeout_seconds}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        request_timeout_seconds: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label={labels.maxOutput}>
                  <Input
                    type="number"
                    min="1"
                    max="100000"
                    value={value.max_output_tokens}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        max_output_tokens: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
              </FormGrid>
            </div>
          </AISettingsEditorSection>
        </div>

        <AISettingsEditorSection
          title="凭据与状态"
          description="API Key 只用于服务端连接；编辑已有连接时留空即可保留当前凭据。"
        >
          <FormGrid columns={2}>
            <Field
              label={`${labels.apiKey}${initial ? ` · ${labels.leaveBlank}` : ""}`}
            >
              <Input
                className="font-mono"
                type="password"
                required={!initial}
                autoComplete="new-password"
                value={value.api_key}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    api_key: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="状态">
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
                {labels.providerEnabled}
              </label>
            </Field>
          </FormGrid>
        </AISettingsEditorSection>

        {surface === "page" ? (
          <FormActions>
            <Button variant="outline" type="button" onClick={handleCancel}>
              {labels.cancel}
            </Button>
            <Button
              variant="solid"
              color="primary"
              type="submit"
              loading={saving}
              icon={<Save />}
            >
              {saving ? labels.saving : labels.saveProvider}
            </Button>
          </FormActions>
        ) : null}
      </div>
    </FormLayout>
  );
}
