import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { membersApi, type BlogMember } from "../../../api/members";
import AdminUsers from "../Users";
import { AppFeedbackProvider } from "../../../components/feedback/AppFeedbackProvider";

vi.mock("@gosso/client/react", () => ({
  useUserProfile: () => ({
    name: "Owner",
    principal: { issuer: "https://sso.dev.local" },
  }),
}));

vi.mock("../../../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../auth")>()),
  getGossoAdminURL: () => "https://sso.dev.local",
  isMfaError: () => false,
}));

vi.mock("../../../components/auth/SudoGate", () => ({
  SudoGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../../components/auth/StepUpMfaModal", () => ({
  StepUpMfaModal: () => null,
}));

const member: BlogMember = {
  principal: {
    id: 9,
    issuer: "https://sso.dev.local",
    subject: "member-subject-1234",
    display_name: "内容编辑",
    email: "editor@example.com",
  },
  membership_status: "active",
  roles: ["editor"],
  permissions: ["content.manage"],
};

describe("AdminUsers list template", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders compact member rows and keeps the protected edit entry wired", async () => {
    const user = userEvent.setup();
    vi.spyOn(membersApi, "list").mockResolvedValue({ members: [member] });

    render(
      <AppFeedbackProvider>
        <MemoryRouter initialEntries={["/admin/users"]}>
          <AdminUsers />
        </MemoryRouter>
      </AppFeedbackProvider>,
    );

    const mobileList = await screen.findByRole("list", { name: "成员列表" });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(within(mobileList).getByText("内容编辑")).toBeInTheDocument();
    expect(
      within(mobileList).getByText("editor@example.com"),
    ).toBeInTheDocument();
    expect(within(mobileList).getByText("编辑")).toBeInTheDocument();

    await user.click(
      within(mobileList).getByRole("button", {
        name: "编辑 内容编辑 成员与权限",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "编辑 内容编辑 的成员信息与权限" }),
      ).toBeInTheDocument();
    });
  });
});
