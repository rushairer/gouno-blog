import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentApproval,
  WorkflowInteractionTask,
} from "../../../types/agent";
import { workflowApi } from "../../../api/workflows";
import { FriendlyApprovalQueue, InteractionInbox } from "../InboxWorkspace";

vi.mock("../../../api/workflows", () => ({
  workflowApi: {
    resolveInteraction: vi.fn(),
  },
}));

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
  expires_at: "2026-09-13T00:00:00Z",
  created_at: "2026-09-12T00:00:00Z",
};

const interaction: WorkflowInteractionTask = {
  id: 31,
  workflow_run_id: 18,
  workflow_step_id: "choose-cover",
  interaction_type: "choice",
  schema: {},
  payload: {},
  options: ["Cover A", "Cover B"],
  status: "pending",
  created_at: "2026-09-12T00:00:00Z",
};

describe("AI Operations inbox surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workflowApi.resolveInteraction).mockResolvedValue(undefined);
  });

  it("uses canonical master-detail composition without the retired inbox CSS shell", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReview = vi.fn();
    const { container } = render(
      <FriendlyApprovalQueue
        locale="en"
        approvals={[approval]}
        selected={approval}
        onSelect={onSelect}
        onReview={onReview}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Changes that need your decision" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your confirmation needed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(container.querySelector(".panel-heading")).not.toBeInTheDocument();
    expect(
      container.querySelector(".agent-approval-workspace"),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".risk-label")).not.toBeInTheDocument();
    expect(
      container.querySelector(".approval-decision"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Apply a content proposal to post #4/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(approval);

    await user.click(screen.getByRole("button", { name: "Reject proposal" }));
    expect(onReview).toHaveBeenCalledWith(approval, false);
    await user.click(
      screen.getByRole("button", { name: "Approve and continue" }),
    );
    expect(onReview).toHaveBeenCalledWith(approval, true);
  });

  it("keeps failed approvals actionable with explicit retry feedback", () => {
    const failed = {
      ...approval,
      status: "failed" as const,
      review_note: "Downstream write failed",
    };
    render(
      <FriendlyApprovalQueue
        locale="en"
        approvals={[failed]}
        selected={failed}
        onSelect={vi.fn()}
        onReview={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The previous execution failed; the proposal is preserved",
    );
    expect(
      screen.getByRole("button", { name: "Retry approval and execution" }),
    ).toBeInTheDocument();
  });

  it("keeps workflow interaction resolution behavior while using canonical rows", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <InteractionInbox
        locale="en"
        tasks={[interaction]}
        onResolved={onResolved}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Workflow interactions" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".workflow-interaction"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cover A" }));
    expect(workflowApi.resolveInteraction).toHaveBeenCalledWith(interaction, {
      option: "Cover A",
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
