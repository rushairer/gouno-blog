import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AdminPages from "../Pages";

import { pagesApi } from "../../../api/pages";
import type { PaginatedPages } from "../../../types/blog";
import { GossoProvider } from "@gosso/client/react";

const snapshot = {
  loggedIn: true,
  isAdmin: true,
  profile: { sub: "admin", roles: ["admin"] },
};
const mockClient = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
} as any;

vi.mock("../../../components/agent/WorkflowLauncher", () => ({
  WorkflowLauncher: ({
    open,
    resourceKeys,
  }: {
    open: boolean;
    resourceKeys: number[];
  }) => (open ? <div>launcher:{resourceKeys.join(",")}</div> : null),
}));

describe("AdminPages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps real page data and actions on the Showcase composition", async () => {
    const user = userEvent.setup();
    const mockData: PaginatedPages = {
      list: [
        {
          id: 1,
          title: "关于站点",
          slug: "about",
          summary: "站点的关于说明",
          content: "正文内容",
          template: "about",
          status: "published",
          allow_comments: false,
          show_in_nav: true,
          sort_order: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          title: "友情链接",
          slug: "links",
          summary: "友情链接列表",
          content: "友链正文",
          template: "links",
          status: "draft",
          allow_comments: false,
          show_in_nav: false,
          sort_order: 20,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 2,
    };

    vi.spyOn(pagesApi, "getAdminPages").mockResolvedValue(mockData);

    render(
      <GossoProvider client={mockClient}>
        <MemoryRouter initialEntries={["/admin/pages"]}>
          <AdminPages />
        </MemoryRouter>
      </GossoProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("关于站点").length).toBeGreaterThan(1);
      expect(screen.getAllByText("/about").length).toBeGreaterThan(1);
      expect(screen.getAllByText("友情链接").length).toBeGreaterThan(1);
      expect(screen.getAllByText("/links").length).toBeGreaterThan(1);
      expect(screen.getAllByText("已发布").length).toBeGreaterThan(0);
      expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);
    });

    expect(
      screen.getByRole("textbox", { name: "搜索单页" }),
    ).toBeInTheDocument();
    const mobileList = screen.getByRole("list", { name: "单页列表" });
    expect(within(mobileList).getAllByRole("listitem")).toHaveLength(2);
    await user.click(
      within(mobileList).getByRole("checkbox", {
        name: "选择单页 关于站点",
      }),
    );
    expect(screen.getByText("已选择 1 页")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "交给 AI" }));
    expect(screen.getByText("launcher:1")).toBeInTheDocument();
  });
});
