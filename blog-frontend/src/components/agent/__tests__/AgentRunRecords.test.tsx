import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordsWorkspace } from "../AgentRunRecords";

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
  it("renders Agent runs as a canonical list and preserves inspect/delete actions", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    const onDelete = vi.fn();

    render(
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
    await user.click(screen.getByRole("button", { name: "查看详情" }));
    expect(onInspect).toHaveBeenCalledWith(run);
    await user.click(screen.getByRole("button", { name: "删除记录" }));
    expect(onDelete).toHaveBeenCalledWith(run);
  });
});
