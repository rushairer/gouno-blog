import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";

import Categories from "../Categories";
import { AppFeedbackProvider } from "../../../components/feedback/AppFeedbackProvider";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

function renderCategories() {
  return render(
    <MemoryRouter>
      <AppFeedbackProvider>
        <Categories />
      </AppFeedbackProvider>
    </MemoryRouter>,
  );
}

describe("Admin Categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it("opens category creation in the right-side drawer with AI Slug assistant", async () => {
    renderCategories();

    expect(
      await screen.findByText("还没有分类。创建第一个分类来组织长期主题。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "新建分类" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    const form = screen
      .getByRole("dialog", { name: "新建分类" })
      .querySelector(".drawer-form");
    expect(form?.querySelectorAll(".field")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "智能生成 Slug 候选" }),
    ).toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: "创建分类" });
    expect(createButton).toHaveAttribute("type", "submit");
    expect(createButton).toHaveClass("bg-primary", "text-primary-foreground");
  });

  it("renders one category collection as desktop table and mobile list with shared selection", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({
        data: [
          {
            id: 31,
            name: "工程实践",
            slug: "engineering-practice",
            description: "设计系统、研发流程与工程化实践。",
            sort_order: 10,
            post_count: 18,
          },
        ],
      }),
    );

    renderCategories();

    const table = await screen.findByRole("table");
    const mobileList = screen.getByRole("list", { name: "分类列表" });
    expect(within(table).getByText("engineering-practice")).toBeInTheDocument();
    expect(
      within(mobileList).getByText("engineering-practice"),
    ).toBeInTheDocument();
    expect(table.closest('[class*="md:block"]')).toBeTruthy();
    expect(mobileList.closest('[class*="md:hidden"]')).toBeTruthy();

    fireEvent.click(
      within(table).getByRole("checkbox", { name: "选择全部分类" }),
    );
    expect(
      within(mobileList).getByRole("checkbox", { name: "选择分类 工程实践" }),
    ).toBeChecked();
    expect(screen.getByText("已选择 1 个分类")).toBeInTheDocument();

    fireEvent.click(
      within(mobileList).getByRole("button", { name: "编辑分类 工程实践" }),
    );
    expect(
      screen.getByRole("dialog", { name: "编辑分类" }),
    ).toBeInTheDocument();
  });
});
