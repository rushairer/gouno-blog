import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { agentRunSummary, RecordsWorkspace } from "../AgentRunRecords";

const agent = {
  id: 3,
  name: "Operations Agent",
  description: "Ops",
  enabled: true,
  trigger_type: "manual",
  timezone: "Asia/Shanghai",
  daily_run_limit: 10,
  monthly_token_budget: 100000,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const run = {
  id: 9,
  agent_id: 3,
  status: "succeeded",
  trigger_type: "manual",
  provider: "OpenAI",
  model: "gpt-5-mini",
  input_tokens: 120,
  output_tokens: 80,
  created_at: "2026-08-01T01:00:00Z",
};

describe("RecordsWorkspace", () => {
  it("keeps navigation summaries concise while preserving full Markdown for detail output", () => {
    const summary = agentRunSummary(
      {
        ...run,
        output_summary:
          "## Long-form execution result\n\n" +
          "LONG_UNBROKEN_DIAGNOSTIC_TOKEN_".repeat(40),
      },
      "zh",
    );

    expect(summary).toBe("Long-form execution result");
    expect(summary).not.toContain("LONG_UNBROKEN_DIAGNOSTIC_TOKEN");
  });

  it("renders Agent runs as a canonical list and preserves inspect/delete actions", async () => {
    window.history.replaceState(null, "", "/admin/ai-ops?tab=records&record=agent");
    const user = userEvent.setup();
    const onInspect = vi.fn();
    const onDelete = vi.fn();

    const { container, rerender } = render(
      <RecordsWorkspace
        locale="zh"
        runs={[run]}
        agents={[agent]}
        selectedRun={null}
        onInspect={onInspect}
        onClearInspect={vi.fn()}
        onDelete={onDelete}
        formatDateTime={(value) => value}
      />,
    );

    expect(
      screen.getByRole("list", { name: "Agent 运行列表" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const frame = container.querySelector('[data-slot="ops-master-detail"]');
    expect(frame).toHaveAttribute("data-mobile-pane", "master");

    await user.click(screen.getByRole("button", { name: "查看 Run #9" }));
    expect(onInspect).toHaveBeenCalledWith(run);
    expect(frame).toHaveAttribute("data-mobile-pane", "detail");
    expect(new URL(window.location.href).searchParams.get("run")).toBe("9");

    rerender(
      <RecordsWorkspace
        locale="zh"
        runs={[run]}
        agents={[agent]}
        selectedRun={{ run, tool_calls: [] }}
        onInspect={onInspect}
        onClearInspect={vi.fn()}
        onDelete={onDelete}
        formatDateTime={(value) => value}
      />,
    );

    await user.click(screen.getByRole("button", { name: "返回运行列表" }));
    expect(frame).toHaveAttribute("data-mobile-pane", "master");
    expect(new URL(window.location.href).searchParams.get("run")).toBeNull();

    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(onDelete).toHaveBeenCalledWith(run);
  });
});
