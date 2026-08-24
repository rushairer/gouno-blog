import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentForm } from "../AgentForm";

describe("AgentForm", () => {
  it("prefills a disabled agent draft without enabling it", () => {
    render(
      <AgentForm
        providers={[
          { id: 4, name: "Local", model: "mock", enabled: true } as never,
        ]}
        skills={[
          {
            id: 8,
            version_id: 9,
            name: "Review",
            version: 1,
            capabilities: [],
            content_publish_mode: "approval",
          } as never,
        ]}
        prefill={{
          name: "内容审校 Agent",
          provider_profile_id: 4,
          skill_version_id: 9,
          enabled: true,
        }}
        locale="zh"
        labels={{} as Record<string, string>}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("内容审校 Agent")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("retains historical skill version in dropdown and displays upgrade banner when newer version exists", () => {
    const historicalSkill = {
      id: 2,
      version_id: 10,
      name: "AI 每日资讯",
      version: 2,
      capabilities: ["rss.fetch"],
      content_publish_mode: "approval",
    };
    const latestSkill = {
      id: 2,
      version_id: 22,
      name: "AI 每日资讯",
      version: 4,
      capabilities: ["rss.fetch"],
      content_publish_mode: "approval",
    };

    const initialAgent = {
      id: 27,
      name: "AI 每日资讯",
      description: "Test agent",
      provider_profile_id: 1,
      skill_version_id: 10,
      skill: historicalSkill,
      enabled: true,
      trigger_type: "manual" as const,
      timezone: "Asia/Shanghai",
      daily_run_limit: 10,
      monthly_token_budget: 300000,
      created_at: "2026-08-21T00:00:00Z",
      updated_at: "2026-08-21T00:00:00Z",
    };

    render(
      <AgentForm
        initial={initialAgent}
        providers={[
          {
            id: 1,
            name: "DeepSeek",
            model: "deepseek-v4-flash",
            enabled: true,
          } as never,
        ]}
        skills={[latestSkill as never]}
        locale="zh"
        labels={{
          agentName: "Agent 名称",
          provider: "Provider / 模型",
          chooseProvider: "选择模型",
          descriptionLabel: "说明",
          trigger: "触发方式",
          manual: "手动执行",
          dailyRuns: "每日运行上限",
          monthlyBudget: "每月 Token 预算",
          enableAgent: "启用此 Agent",
          cancel: "取消",
          saveAgent: "保存 Agent",
          editAgent: "编辑 Agent",
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Dropdown contains both the legacy bound version and the latest version
    expect(
      screen.getByRole("option", {
        name: /AI 每日资讯 · v2 \(当前绑定 · 旧版本\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /AI 每日资讯 · v4/ }),
    ).toBeInTheDocument();

    // Shows the upgrade notice
    expect(screen.getByText(/检测到该 Skill 已更新至 v4/)).toBeInTheDocument();

    // Click the upgrade button
    const upgradeButton = screen.getByRole("button", { name: "升级至 v4" });
    expect(upgradeButton).toBeInTheDocument();
    fireEvent.click(upgradeButton);

    // After clicking upgrade, the banner disappears and current policy reflects v4
    expect(
      screen.queryByText(/检测到该 Skill 已更新至 v4/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/AI 每日资讯 · v4/)).toHaveLength(2);
  });
});
