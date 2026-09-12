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

  it("uses the Showcase empty state and canonical category drawer composition", async () => {
    renderCategories();

    expect(await screen.findByText("还没有分类")).toBeInTheDocument();
    expect(
      screen.getByText("创建第一个分类来组织长期主题。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "新建分类" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    const dialog = screen.getByRole("dialog", { name: "新建分类" });
    expect(dialog.querySelector(".drawer-form")).toBeNull();
    expect(within(dialog).getByLabelText("分类名称")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Slug 标识")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("分类描述")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("分类排序")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "AI 生成" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "创建分类" }),
    ).toHaveClass("bg-primary", "text-primary-foreground");
  });

  it("renders one category collection as Showcase desktop/mobile views with shared selection", async () => {
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
    expect(within(table).getByText("工程实践").closest("tr")).toHaveAttribute(
      "data-state",
      "selected",
    );

    fireEvent.click(
      within(mobileList).getByRole("button", { name: "编辑分类 工程实践" }),
    );
    const dialog = screen.getByRole("dialog", { name: "编辑分类" });
    expect(within(dialog).getByLabelText("分类名称")).toHaveValue("工程实践");
    expect(within(dialog).getByLabelText("Slug 标识")).toHaveValue(
      "engineering-practice",
    );
  });
});
