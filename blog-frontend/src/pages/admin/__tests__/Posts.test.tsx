import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { postsApi } from "../../../api/posts";
import { siteApi } from "../../../api/site";
import type { Post } from "../../../types/blog";
import AdminPosts from "../Posts";
import { AppFeedbackProvider } from "../../../components/feedback/AppFeedbackProvider";

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

vi.mock("../../../abilities", () => ({
  useAbility: () => ({
    can: () => true,
    cannot: () => false,
    principalId: 1,
  }),
}));

vi.mock("../../../components/agent/WorkflowLauncher", () => ({
  WorkflowLauncher: ({
    open,
    resourceKeys,
  }: {
    open: boolean;
    resourceKeys: number[];
  }) => (open ? <div>launcher:{resourceKeys.join(",")}</div> : null),
}));

const post: Post = {
  id: 7,
  title: "面向未来的内容架构",
  slug: "future-content",
  summary: "测试摘要",
  content: "正文",
  tags: ["architecture"],
  status: "published",
  category: { id: 2, name: "架构", slug: "architecture" },
  views_count: 128,
  created_by_principal_id: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
};

function renderPosts(entry = "/admin/posts") {
  return render(
    <AppFeedbackProvider>
      <MemoryRouter initialEntries={[entry]}>
        <AdminPosts />
      </MemoryRouter>
    </AppFeedbackProvider>,
  );
}

describe("AdminPosts list template", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(siteApi, "getCategories").mockResolvedValue([post.category!]);
    vi.spyOn(siteApi, "getAdminTags").mockResolvedValue([
      { name: "architecture", post_count: 1 },
    ]);
  });

  it("renders desktop and compact mobile rows and preserves bulk selection", async () => {
    const user = userEvent.setup();
    vi.spyOn(postsApi, "getPosts").mockResolvedValue({
      list: [post],
      total: 1,
    });

    renderPosts();

    const mobileList = await screen.findByRole("list", { name: "文章列表" });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      within(mobileList).getByText("面向未来的内容架构"),
    ).toBeInTheDocument();
    expect(within(mobileList).getByText("128 次阅读")).toBeInTheDocument();

    await user.click(
      within(mobileList).getByRole("checkbox", {
        name: "选择文章 面向未来的内容架构",
      }),
    );
    expect(screen.getByText("已选择 1 篇")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "交给 AI" }));
    expect(screen.getByText("launcher:7")).toBeInTheDocument();
  });

  it("preserves query filters and the retryable error state", async () => {
    const getPosts = vi
      .spyOn(postsApi, "getPosts")
      .mockRejectedValue(new Error("文章服务暂时不可用"));

    renderPosts("/admin/posts?q=架构&status=draft&page=2");

    expect(
      await screen.findByRole("button", { name: "重试" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("文章服务暂时不可用").length).toBeGreaterThan(0);
    const query = getPosts.mock.calls[0][0] as URLSearchParams;
    expect(query.get("q")).toBe("架构");
    expect(query.get("status")).toBe("draft");
    expect(query.get("page")).toBe("2");
  });

  it("distinguishes filtered empty results from the first-content state", async () => {
    vi.spyOn(postsApi, "getPosts").mockResolvedValue({ list: [], total: 0 });

    renderPosts("/admin/posts?q=missing");

    await waitFor(() => {
      expect(
        screen.getByText("没有符合当前筛选条件的文章。"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "清除筛选" }),
    ).toBeInTheDocument();
  });
});
