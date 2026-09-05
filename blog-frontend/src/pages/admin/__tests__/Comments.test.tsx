import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { ToastProvider } from "@gouno/ui";
import AdminComments from "../Comments";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});
vi.mock("../../../hooks/useAdminGuard", () => ({ useAdminGuard: () => true }));
vi.mock("../../../components/agent/WorkflowLauncher", () => ({
  WorkflowLauncher: ({
    open,
    resourceKeys,
  }: {
    open: boolean;
    resourceKeys: number[];
  }) => (open ? <div>launcher:{resourceKeys.join(",")}</div> : null),
}));

describe("AdminComments structured AI input", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({
        data: {
          list: [
            {
              id: 17,
              post_id: 4,
              author: "Reader",
              content: "Could you explain this?",
              status: "pending",
              is_visible: false,
              report_count: 0,
              created_at: "2026-08-02T00:00:00Z",
            },
          ],
        },
      }),
    );
  });

  it("passes selected comment IDs to the Workflow launcher", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminComments />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "选择评论 17" }),
    );
    expect(screen.getByText("已选择 1 条评论")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "交给 AI" }));
    expect(screen.getByText("launcher:17")).toBeInTheDocument();
  });
});
