import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Workflow, WorkflowMetric, WorkflowRun } from "../../../types/agent";
import { WorkflowWorkspace } from "../WorkflowWorkspace";

const workflow: Workflow = {
  id: 7,
  name: "Daily digest",
  description: "Summarize the day with governed evidence.",
  enabled: true,
  cron_expression: "0 9 * * *",
  timezone: "Asia/Shanghai",
  template_key: "daily-digest",
  current_version: 4,
  version_id: 14,
  input_schema: { type: "object", additionalProperties: false },
  steps: [
    { id: "discover", name: "发现资讯", type: "resource_query", resource_type: "post", filter: {}, max_items: 20 },
    { id: "result", name: "输出摘要", type: "output", output_pointer: "/steps/discover" },
  ],
  scope_policy: { mode: "strict", discovery_tools: ["content.find_related"] },
  resource_query_empty_policy: "succeed",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-17T00:00:00Z",
};

const metric: WorkflowMetric = {
  workflow_id: 7,
  name: "Daily digest",
  runs: 12,
  failures: 2,
  tokens: 12800,
};

const run: WorkflowRun = {
  id: 21,
  workflow_id: 7,
  workflow_version_id: 14,
  dry_run: false,
  status: "succeeded",
  input: {},
  input_tokens: 120,
  output_tokens: 80,
  started_at: "2026-09-17T08:30:00Z",
  finished_at: "2026-09-17T08:30:08Z",
  created_at: "2026-09-17T08:30:00Z",
};

describe("AI Operations Workflow canonical operational detail", () => {
  it("keeps the Workflow rail and operational detail in one workspace", () => {
    render(
      <MemoryRouter>
        <WorkflowWorkspace
          workflows={[workflow]}
          runs={[run]}
          metrics={[metric]}
          agents={[]}
          locale="zh"
          onRun={vi.fn()}
          onSave={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("list", { name: "Workflow 列表" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 Workflow：Daily digest" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: "Daily digest Workflow 概览" }),
    ).toBeInTheDocument();
    expect(screen.getByText("成功率")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "最近运行" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看最近 Run #21" })).toHaveAttribute(
      "href",
      "/admin/ai-ops?tab=records&record=workflow&workflow=7&run=21",
    );
    expect(
      screen.getByRole("region", { name: "Workflow 流程定义" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Workflow 运行边界" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "运行当前 Workflow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更多 Workflow 操作" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回工作流列表" })).toBeNull();
  });
});
