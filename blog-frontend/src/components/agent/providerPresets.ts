import type { ProviderType, ProviderVendor } from "../../types/agent";

export interface ProviderPreset {
  vendor: ProviderVendor;
  label: string;
  providerType: ProviderType;
  baseURL: string;
  protocolMode: string;
  modelPlaceholder: string;
  note: string;
}

export const providerPresets: ProviderPreset[] = [
  {
    vendor: "openai",
    label: "OpenAI",
    providerType: "openai",
    baseURL: "https://api.openai.com",
    protocolMode: "responses",
    modelPlaceholder: "gpt-5.6",
    note: "OpenAI native · Responses API recommended",
  },
  {
    vendor: "anthropic",
    label: "Anthropic Claude",
    providerType: "anthropic",
    baseURL: "https://api.anthropic.com",
    protocolMode: "",
    modelPlaceholder: "claude-sonnet-4-5",
    note: "Anthropic Messages API",
  },
  {
    vendor: "google",
    label: "Google Gemini",
    providerType: "gemini",
    baseURL: "https://generativelanguage.googleapis.com",
    protocolMode: "generate_content",
    modelPlaceholder: "gemini-3.1-pro-preview",
    note: "Gemini native generateContent",
  },
  {
    vendor: "deepseek",
    label: "DeepSeek",
    providerType: "openai",
    baseURL: "https://api.deepseek.com",
    protocolMode: "chat_completions",
    modelPlaceholder: "deepseek-chat",
    note: "OpenAI-compatible; Anthropic-compatible endpoints can also be configured manually",
  },
  {
    vendor: "alibaba_bailian",
    label: "Alibaba Bailian / Qwen",
    providerType: "openai",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "qwen-plus",
    note: "OpenAI-compatible preset; workspace endpoints remain editable",
  },
  {
    vendor: "volcengine_ark",
    label: "Volcengine Ark / Doubao",
    providerType: "openai",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    protocolMode: "chat_completions",
    modelPlaceholder: "doubao-seed-1-8-251228",
    note: "Ark OpenAI-compatible API root",
  },
  {
    vendor: "tencent_hunyuan",
    label: "Tencent Hunyuan",
    providerType: "openai",
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "hunyuan-turbos-latest",
    note: "OpenAI-compatible API",
  },
  {
    vendor: "baidu_qianfan",
    label: "Baidu Qianfan",
    providerType: "openai",
    baseURL: "https://qianfan.baidubce.com/v2",
    protocolMode: "chat_completions",
    modelPlaceholder: "ernie-4.0-turbo-8k",
    note: "Qianfan v2 OpenAI-compatible API",
  },
  {
    vendor: "moonshot",
    label: "Moonshot / Kimi",
    providerType: "openai",
    baseURL: "https://api.moonshot.cn/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "kimi-k2.5",
    note: "China endpoint preset; international endpoint can be entered manually",
  },
  {
    vendor: "zhipu",
    label: "Zhipu GLM",
    providerType: "openai",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    protocolMode: "chat_completions",
    modelPlaceholder: "glm-5",
    note: "OpenAI-compatible API root",
  },
  {
    vendor: "siliconflow",
    label: "SiliconFlow",
    providerType: "openai",
    baseURL: "https://api.siliconflow.cn/v1",
    protocolMode: "chat_completions",
    modelPlaceholder: "deepseek-ai/DeepSeek-V3.2",
    note: "OpenAI-compatible multi-model gateway",
  },
  {
    vendor: "minimax",
    label: "MiniMax",
    providerType: "openai",
    baseURL: "https://api.minimaxi.com",
    protocolMode: "chat_completions",
    modelPlaceholder: "MiniMax-M2.7",
    note: "China endpoint; switch to api.minimax.io for global accounts when appropriate",
  },
  {
    vendor: "custom",
    label: "Custom / compatible",
    providerType: "openai",
    baseURL: "",
    protocolMode: "chat_completions",
    modelPlaceholder: "model-name",
    note: "Any SSRF-safe compatible endpoint",
  },
];

export const providerPresetByVendor = new Map(
  providerPresets.map((preset) => [preset.vendor, preset]),
);
