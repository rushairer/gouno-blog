import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentForm } from "../AgentForm";
import { EmbeddingForm } from "../EmbeddingForm";
import { ProviderForm } from "../ProviderForm";
import { SkillForm } from "../SkillForm";

const agentLabels = {
  agentName: "Agent 名称",
  provider: "Provider / 模型",
  descriptionLabel: "说明",
  trigger: "触发方式",
  manual: "手动执行",
  dailyRuns: "每日运行上限",
  monthlyBudget: "每月 Token 预算",
  enableAgent: "启用此 Agent",
  cancel: "取消",
  saveAgent: "保存 Agent",
  saving: "保存中…",
  editAgent: "编辑 Agent",
  createAgent: "创建 Agent",
  cron: "Cron expression",
  timezone: "Timezone",
};

const providerLabels = {
  editProvider: "编辑模型连接",
  createProvider: "添加模型连接",
  providerName: "连接名称",
  providerType: "供应商类型",
  protocolMode: "接口协议模式",
  streamMode: "流式传输 (Stream)",
  baseUrl: "Base URL",
  model: "模型",
  apiKey: "API Key",
  leaveBlank: "留空保留现有密钥",
  timeout: "请求超时（秒）",
  maxOutput: "最大输出 Token",
  providerEnabled: "启用此模型连接",
  cancel: "取消",
  saveProvider: "保存模型连接",
  saving: "保存中…",
};

describe("AI Settings canonical editors", () => {
  it("groups Agent configuration by identity, capability, schedule, and governance", () => {
    render(
      <AgentForm
        providers={[
          {
            id: 1,
            name: "Primary",
            model: "primary-model",
            enabled: true,
            is_default_writing: true,
          } as never,
        ]}
        skills={[
          {
            id: 2,
            version_id: 20,
            version: 3,
            name: "Content Maintainer",
            description: "Maintain content",
            capabilities: ["content.read"],
            content_publish_mode: "approval",
            max_steps: 8,
            max_input_tokens: 32000,
            max_output_tokens: 8000,
            default_daily_run_limit: 20,
            default_monthly_token_budget: 2000000,
          } as never,
        ]}
        locale="zh"
        labels={agentLabels}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("基础信息")).toBeInTheDocument();
    expect(screen.getByText("能力绑定")).toBeInTheDocument();
    expect(screen.getByText("运行计划")).toBeInTheDocument();
    expect(screen.getByText("运行治理")).toBeInTheDocument();
    expect(screen.getByText("每日运行上限")).toBeInTheDocument();
    expect(screen.getByText("每月 Token 预算")).toBeInTheDocument();
    expect(screen.getByText("最大步数覆盖")).toBeInTheDocument();
    expect(screen.getByText("最大输入 Token 覆盖")).toBeInTheDocument();
    expect(screen.getByText("最大输出 Token 覆盖")).toBeInTheDocument();
  });

  it("keeps Skill governance limits inside the execution boundary", () => {
    render(
      <SkillForm
        tools={[]}
        locale="zh"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("能力定义")).toBeInTheDocument();
    expect(screen.getByText("执行边界")).toBeInTheDocument();
    expect(screen.getByText("Max steps")).toBeInTheDocument();
    expect(screen.getByText("默认日运行上限")).toBeInTheDocument();
    expect(screen.getByText("Max input tokens")).toBeInTheDocument();
    expect(screen.getByText("Max output tokens")).toBeInTheDocument();
    expect(screen.getByText("默认月 Token 预算")).toBeInTheDocument();
  });

  it("groups Provider configuration into identity, credentials, and endpoint behavior", () => {
    render(
      <ProviderForm
        labels={providerLabels}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("连接身份")).toBeInTheDocument();
    expect(screen.getByText("凭据与状态")).toBeInTheDocument();
    expect(screen.getByText("模型与端点")).toBeInTheDocument();
  });

  it("groups Embedding configuration into index semantics and connectivity", () => {
    render(
      <EmbeddingForm locale="zh" onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("索引模型")).toBeInTheDocument();
    expect(screen.getByText("连接与凭据")).toBeInTheDocument();
  });
});
