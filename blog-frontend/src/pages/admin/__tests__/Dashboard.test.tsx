import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";
import { apiFetch } from "../../../auth";

vi.mock("@gosso/client/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gosso/client/react")>()),
  useUserProfile: () => ({
    sub: "admin",
    roles: ["admin"],
    permissions: ["content.manage", "community.moderate", "ai.manage"],
  }),
}));

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    getUserProfile: () => ({ name: "Admin", role: "admin" }),
    hasBlogPermission: () => true,
    hasAnyBlogPermission: () => true,
    getBlogRoleLabel: () => "管理员",
    getCachedBlogSession: () => null,
  };
});

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

const mockSummary = {
  total_posts: 10,
  published_posts: 8,
  total_views: 1200,
  total_likes: 35,
  total_comments: 5,
  pending_comments: 1,
  reported_items: 0,
  top_posts: [],
  daily_events: [{ date: "2026-08-18", count: 10 }],
  ai_alerts: [
    {
      id: 1,
      type: "ai_workflow_failed",
      title: "Workflow 运行失败：AI 每日资讯",
      body: "invalid workflow: Agent run 11 failed",
      href: "/admin/ai-ops?tab=records&workflow=4",
      created_at: "2026-08-18T09:38:34Z",
    },
  ],
};

describe("Admin Dashboard", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (String(url).includes("/api/admin/analytics")) {
        return Response.json({ data: mockSummary });
      }
      return Response.json({ data: null });
    });
  });

  it("renders AI operations alerts and clears them when clicking mark all read", async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    expect(await screen.findByText("AI 运营提醒")).toBeInTheDocument();
    expect(
      screen.getByText(/invalid workflow: Agent run 11 failed/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "全部已读" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部已读" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/me/notifications/read-all", {
        method: "PUT",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("AI 运营提醒")).not.toBeInTheDocument();
    });
  });
});
