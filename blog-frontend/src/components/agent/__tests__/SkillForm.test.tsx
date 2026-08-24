import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillForm } from "../SkillForm";
import type { ToolDefinition } from "../../../types/agent";

const mockTools: ToolDefinition[] = [
  {
    name: "rss.fetch",
    description: "Fetch RSS",
    description_zh: "抓取 RSS 资讯",
    parameters: {},
    configuration_schema: { type: "object" },
    surfaces: ["agent"],
    risk_level: "read",
  },
  {
    name: "content.create_post",
    description: "Create post",
    description_zh: "创建文章",
    parameters: {},
    surfaces: ["agent"],
    risk_level: "write",
  },
];

describe("SkillForm", () => {
  it("renders visual RSS feed configuration when rss.fetch is checked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <SkillForm
        tools={mockTools}
        locale="zh"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    // Initially RSS config is not present
    expect(
      screen.queryByText("RSS 订阅源设置 (rss.fetch)"),
    ).not.toBeInTheDocument();

    // Check rss.fetch
    const rssCheckbox = screen.getByRole("checkbox", { name: /rss\.fetch/ });
    await user.click(rssCheckbox);

    // Now RSS config is visible
    expect(
      await screen.findByText("RSS 订阅源设置 (rss.fetch)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /可视化配置/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JSON/ })).toBeInTheDocument();
  });

  it("allows switching between visual form and raw JSON mode", async () => {
    const user = userEvent.setup();

    render(
      <SkillForm
        initial={{
          id: 1,
          name: "Daily News",
          description: "News generator",
          system_prompt: "Generate news",
          capabilities: ["rss.fetch"],
          execution_mode: "approval",
          content_publish_mode: "approval",
          max_steps: 6,
          max_input_tokens: 16000,
          max_output_tokens: 2000,
          default_daily_run_limit: 10,
          default_monthly_token_budget: 1000000,
          version: 1,
          version_id: 1,
          input_schema: { type: "object" },
          allowed_triggers: ["manual"],
          tool_bindings: {
            "rss.fetch": {
              feeds: [
                { name: "Tech Blog", url: "https://tech.example.com/feed" },
              ],
            },
          },
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        }}
        tools={mockTools}
        locale="zh"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Visual mode by default
    expect(screen.getByDisplayValue("Tech Blog")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://tech.example.com/feed"),
    ).toBeInTheDocument();

    // Switch to JSON mode
    const jsonBtn = screen.getByRole("button", { name: "JSON" });
    await user.click(jsonBtn);

    expect(screen.getByText("原始 JSON 绑定配置")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/https:\/\/tech\.example\.com\/feed/),
    ).toBeInTheDocument();
  });
});
