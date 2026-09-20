import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  Workflow,
  WorkflowInteractionTask,
  WorkflowMetric,
  WorkflowRun,
} from "../../../types/agent";
import { WorkspaceOverview } from "../WorkspaceOverview";

const workflow: Workflow = {
  id: 42,
  name: "旧文维护",
  description: "发现需要维护的旧文章并生成受控建议。",
  enabled: true,
  cron_expression: "0 9 * * 1",
  timezone: "Asia/Shanghai",
  next_run_at: "2026-09-21T01:00:00Z",
  template_key: "stale-post-maintenance",
  current_version: 4,
  version_id: 104,
  input_schema: {},
  steps: [],
  scope_policy: { mode: "strict", discovery_tools: ["query_posts"] },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-16T00:00:00Z",
};

const failedRun: WorkflowRun = {
  id: 900,
  workflow_id: workflow.id,
  workflow_version_id: workflow.version_id,
  dry_run: false,
  status: "failed",
  input: {},
  error_code: "provider_timeout",
  error_message: "provider timeout",
  input_tokens: 1200,
  output_tokens: 340,
  started_at: "2026-09-17T08:30:00Z",
  finished_at: "2026-09-17T08:30:12Z",
  created_at: "2026-09-17T08:30:00Z",
};

const interaction: WorkflowInteractionTask = {
  id: 31,
  workflow_run_id: 901,
  workflow_step_id: "choose-cover",
  interaction_type: "choice",
  schema: {},
  payload: { title: "选择文章封面方向" },
  options: ["极简架构图", "科技插画"],
  status: "pending",
  created_at: "2026-09-17T08:31:00Z",
};

const metric: WorkflowMetric = {
  workflow_id: workflow.id,
  name: workflow.name,
  runs: 12,
  failures: 2,
  tokens: 12800,
};

describe("AI Operations canonical overview", () => {
  it("binds Showcase hierarchy to real Workflow run, handoff and metric data", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <WorkspaceOverview
        locale="zh"
        approvals={[]}
        interactions={[interaction]}
        suggestions={[]}
        candidateSets={[]}
        mediaCandidates={[]}
        workflows={[workflow]}
        workflowRuns={[failedRun]}
        workflowMetrics={[metric]}
        editorialTasks={[]}
        formatDateTime={(value) => value || "—"}
        onNavigate={onNavigate}
      />,
    );

    expect(
      screen.getByText(
        "先处理失败与等待人工的运行，再决定建议、候选和后续编辑任务；AI 不会绕过人工边界直接发布内容。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "今天需要关注什么" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Run #900 · 旧文维护")).toBeInTheDocument();
    expect(screen.getByText("provider timeout")).toBeInTheDocument();
    expect(screen.getByText("12 次运行 · 2 次失败")).toBeInTheDocument();
    expect(screen.getByText("1,540")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "待我处理 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "进入运行中心" }));
    expect(onNavigate).toHaveBeenCalledWith("records");

    await user.click(screen.getByRole("button", { name: "查看自动化" }));
    expect(onNavigate).toHaveBeenCalledWith("automation");
  });
});
