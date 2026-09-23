import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentApproval,
  WorkflowInteractionTask,
} from "../../../types/agent";
import { DecisionInboxWorkspace } from "../DecisionInboxWorkspace";

const interaction: WorkflowInteractionTask = {
  id: 31,
  workflow_run_id: 18,
  workflow_step_id: "choose-cover",
  interaction_type: "choice",
  schema: {},
  payload: {
    title: "选择文章封面方向",
    reason: "当前 Run 需要人工选择后才能继续。",
  },
  options: ["极简架构图", "科技插画"],
  status: "pending",
  created_at: "2026-09-17T08:30:00Z",
};

const approval: AgentApproval = {
  id: 7,
  run_id: 12,
  tool_call_id: 21,
  action_type: "update_post",
  target_type: "post",
  target_id: 4,
  proposed_payload: {
    title: "Updated title",
    summary: "Updated summary",
  },
  before_snapshot: { title: "Original title" },
  status: "pending",
  expires_at: "2026-09-18T00:00:00Z",
  created_at: "2026-09-17T08:00:00Z",
};

describe("AI Operations unified decision workbench", () => {
  it("combines human interactions and approvals into one selected decision queue", async () => {
    const user = userEvent.setup();
    const onSelectApproval = vi.fn();

    const { container } = render(
      <DecisionInboxWorkspace
        locale="zh"
        approvals={[approval]}
        selectedApproval={null}
        onSelectApproval={onSelectApproval}
        onReviewApproval={vi.fn()}
        interactions={[interaction]}
        onResolvedInteraction={vi.fn().mockResolvedValue(undefined)}
        suggestions={[]}
        candidateSets={[]}
        mediaCandidates={[]}
        editorialTasks={[]}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        formatDateTime={(value) => value || "—"}
      />,
    );

    expect(
      screen.getByText(
        /把审批、选择、确认、运营建议和后续编辑任务放进同一人工决策队列/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "人工决策队列" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "待处理列表" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "选择文章封面方向" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Run #18 · choose-cover")).toHaveLength(2);
    const frame = container.querySelector('[data-slot="ops-master-detail"]');
    expect(frame).toHaveAttribute("data-mobile-pane", "master");

    await user.click(screen.getByRole("button", { name: "审批" }));
    expect(frame).toHaveAttribute("data-mobile-pane", "master");

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "对文章 #4应用内容建议",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("不会影响其他文章或站点设置。"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "处理：对文章 #4应用内容建议" }),
    );
    expect(onSelectApproval).toHaveBeenCalledWith(approval);
    expect(frame).toHaveAttribute("data-mobile-pane", "detail");

    await user.click(
      screen.getByRole("button", { name: "返回决策队列" }),
    );
    expect(frame).toHaveAttribute("data-mobile-pane", "master");
  });
});
